/**
 * Utilitário para extrair atributos e schemas de conteúdo AMPscript de assets SFMC.
 * Responsabilidade: apenas extração estrutural — a geração de valores mock
 * é responsabilidade da IA que consome o resultado desta análise.
 */

export interface JsonSchema {
  /** Nome da variável AMPscript que recebe o JSON (ex: "json") */
  variableName: string;
  /** Mapa de jsonPath → lista de campos: ex: "$.client" → ["name","document"] */
  paths: Record<string, string[]>;
  /**
   * Paths detectados via Concat() dinâmico — o path base foi inferido.
   * Ex: Concat("$.shoppingCart.products[", @P-1, "]") → "$.shoppingCart.products[*]"
   */
  dynamicPaths?: Record<string, string[]>;
}

export interface RaiseErrorGuard {
  /** Mensagem passada ao RaiseError() */
  message: string;
  /** Variável AMPscript ou path JSON que o guard protege (quando identificável) */
  guardedVariable?: string;
}

export interface ParsedAssetAttributes {
  /** Atributos simples via AttributeValue("campo") */
  simpleAttributes: string[];
  /** Esquemas JSON complexos via BuildRowsetFromJSON */
  jsonSchemas: JsonSchema[];
  /** Guards RaiseError() identificados no template — indicam seções JSON obrigatórias */
  raisedErrors: RaiseErrorGuard[];
  /** IDs de content blocks referenciados via CONTENTBLOCKBYID() */
  contentBlockIds: number[];
  /** Nomes de content blocks referenciados via CONTENTBLOCKBYNAME() */
  contentBlockNames: string[];
}

/**
 * Extrai nomes de atributos simples via `AttributeValue("campo")`.
 */
export function extractSimpleAttributes(content: string): string[] {
  const regex = /AttributeValue\(\s*["'](\w+)["']\s*\)/gi;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found);
}

/**
 * Extrai schemas JSON via `BuildRowsetFromJSON(@var, "$.path", ...)` e
 * os campos acessados via `Field(@rowVar, "campo")` dentro de cada bloco.
 *
 * Também detecta paths dinâmicos via `BuildRowsetFromJSON(@var, Concat(...), ...)`
 * e infere o path base marcando-os em `dynamicPaths`.
 */
export function extractJsonSchemas(content: string): JsonSchema[] {
  // SET @rowsetVar = BuildRowsetFromJSON(@jsonVar, "$.path", ...)
  const rowsetRegex = /SET\s+@(\w+)\s*=\s*BuildRowsetFromJSON\s*\(\s*@(\w+)\s*,\s*["']([^"']+)["']/gi;
  // SET @rowsetVar = BuildRowsetFromJSON(@jsonVar, Concat("base[", ...), ...)  — path dinâmico
  const rowsetDynRegex = /SET\s+@(\w+)\s*=\s*BuildRowsetFromJSON\s*\(\s*@(\w+)\s*,\s*Concat\s*\(\s*["']([^"']+)["']/gi;
  // SET @rowVar = Row(@rowsetVar, ...)
  const rowRegex = /SET\s+@(\w+)\s*=\s*Row\s*\(\s*@(\w+)\s*,/gi;
  // Field(@rowVar, "campo")
  const fieldRegex = /Field\s*\(\s*@(\w+)\s*,\s*["'](\w+)["']\s*\)/gi;

  // rowsetVar → { jsonVar, path }
  const rowsetMap = new Map<string, { jsonVar: string; path: string }>();
  // rowsetVar → { jsonVar, basePath } for dynamic paths
  const rowsetDynMap = new Map<string, { jsonVar: string; basePath: string }>();
  let m: RegExpExecArray | null;

  while ((m = rowsetRegex.exec(content)) !== null) {
    rowsetMap.set(m[1].toLowerCase(), { jsonVar: m[2].toLowerCase(), path: m[3] });
  }

  while ((m = rowsetDynRegex.exec(content)) !== null) {
    const rowsetVar = m[1].toLowerCase();
    // Only register as dynamic if not already captured as static
    if (!rowsetMap.has(rowsetVar)) {
      // Infer the base path: "$.shoppingCart.products[" → "$.shoppingCart.products[*]"
      const rawBase = m[3];
      const inferredPath = rawBase.endsWith('[') ? `${rawBase}*]` : `${rawBase}[*]`;
      rowsetDynMap.set(rowsetVar, { jsonVar: m[2].toLowerCase(), basePath: inferredPath });
    }
  }

  // rowVar → rowsetVar
  const rowMap = new Map<string, string>();
  while ((m = rowRegex.exec(content)) !== null) {
    rowMap.set(m[1].toLowerCase(), m[2].toLowerCase());
  }

  // jsonVar → path → Set<campo>
  const schemaMap = new Map<string, Map<string, Set<string>>>();
  // jsonVar → dynPath → Set<campo>
  const dynSchemaMap = new Map<string, Map<string, Set<string>>>();

  while ((m = fieldRegex.exec(content)) !== null) {
    const rowVar = m[1].toLowerCase();
    const fieldName = m[2];

    const rowsetVar = rowMap.get(rowVar);
    if (!rowsetVar) continue;

    // Check static rowsets first
    const rowsetInfo = rowsetMap.get(rowsetVar);
    if (rowsetInfo) {
      const { jsonVar, path } = rowsetInfo;
      if (!schemaMap.has(jsonVar)) schemaMap.set(jsonVar, new Map());
      const pathMap = schemaMap.get(jsonVar)!;
      if (!pathMap.has(path)) pathMap.set(path, new Set());
      pathMap.get(path)!.add(fieldName);
      continue;
    }

    // Check dynamic rowsets
    const dynInfo = rowsetDynMap.get(rowsetVar);
    if (dynInfo) {
      const { jsonVar, basePath } = dynInfo;
      if (!dynSchemaMap.has(jsonVar)) dynSchemaMap.set(jsonVar, new Map());
      const pathMap = dynSchemaMap.get(jsonVar)!;
      if (!pathMap.has(basePath)) pathMap.set(basePath, new Set());
      pathMap.get(basePath)!.add(fieldName);
    }
  }

  // Merge into JsonSchema array (one per jsonVar)
  const allJsonVars = new Set([...schemaMap.keys(), ...dynSchemaMap.keys()]);
  const schemas: JsonSchema[] = [];

  for (const variableName of allJsonVars) {
    const paths: Record<string, string[]> = {};
    const dynamicPaths: Record<string, string[]> = {};

    const staticPaths = schemaMap.get(variableName);
    if (staticPaths) {
      for (const [path, fields] of staticPaths) {
        paths[path] = Array.from(fields);
      }
    }

    const dynPaths = dynSchemaMap.get(variableName);
    if (dynPaths) {
      for (const [path, fields] of dynPaths) {
        dynamicPaths[path] = Array.from(fields);
      }
    }

    const schema: JsonSchema = { variableName, paths };
    if (Object.keys(dynamicPaths).length > 0) schema.dynamicPaths = dynamicPaths;
    schemas.push(schema);
  }

  return schemas;
}

/**
 * Extrai guards RaiseError() do conteúdo AMPscript.
 * Tenta identificar qual variável/condição aciona o erro.
 */
export function extractRaiseErrorGuards(content: string): RaiseErrorGuard[] {
  // Matches: RaiseError("mensagem") — single or double quotes
  const raiseRegex = /RaiseError\s*\(\s*["']([^"']+)["']/gi;
  const guards: RaiseErrorGuard[] = [];
  let m: RegExpExecArray | null;

  while ((m = raiseRegex.exec(content)) !== null) {
    const message = m[1];
    const matchIndex = m.index;

    // Look back up to 500 chars for a RowCount/IF condition to identify the guarded variable
    const context = content.slice(Math.max(0, matchIndex - 500), matchIndex);

    // Find the closest variable in an IF condition: IF @varName ... THEN
    const ifMatch = context.match(/IF\s+(?:RowCount\s*\(\s*)?@(\w+)/gi);
    let guardedVariable: string | undefined;
    if (ifMatch && ifMatch.length > 0) {
      const lastIf = ifMatch[ifMatch.length - 1];
      const varMatch = lastIf.match(/@(\w+)/i);
      if (varMatch) guardedVariable = varMatch[1];
    }

    guards.push({ message, ...(guardedVariable && { guardedVariable }) });
  }

  return guards;
}

/**
 * Extrai IDs de content blocks referenciados via CONTENTBLOCKBYID("id").
 */
export function extractContentBlockIds(content: string): number[] {
  const regex = /CONTENTBLOCKBYID\s*\(\s*["']?(\d+)["']?\s*\)/gi;
  const ids = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    ids.add(parseInt(m[1], 10));
  }
  return Array.from(ids);
}

/**
 * Extrai nomes de content blocks referenciados via CONTENTBLOCKBYNAME("nome").
 */
export function extractContentBlockNames(content: string): string[] {
  const regex = /CONTENTBLOCKBYNAME\s*\(\s*["']([^"']+)["']\s*\)/gi;
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    names.add(m[1]);
  }
  return Array.from(names);
}

/**
 * Analisa o conteúdo de um asset e retorna os atributos necessários:
 * - `simpleAttributes`: atributos acessados via AttributeValue()
 * - `jsonSchemas`: variáveis JSON com paths e campos identificados via BuildRowsetFromJSON
 * - `raisedErrors`: guards RaiseError() identificados no template
 * - `contentBlockIds`: IDs de blocos referenciados via CONTENTBLOCKBYID()
 * - `contentBlockNames`: nomes de blocos referenciados via CONTENTBLOCKBYNAME()
 */
export function parseAssetAttributes(content: string): ParsedAssetAttributes {
  return {
    simpleAttributes: extractSimpleAttributes(content),
    jsonSchemas: extractJsonSchemas(content),
    raisedErrors: extractRaiseErrorGuards(content),
    contentBlockIds: extractContentBlockIds(content),
    contentBlockNames: extractContentBlockNames(content),
  };
}
