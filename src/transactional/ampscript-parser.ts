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
}

export interface ParsedAssetAttributes {
  /** Atributos simples via AttributeValue("campo") */
  simpleAttributes: string[];
  /** Esquemas JSON complexos via BuildRowsetFromJSON */
  jsonSchemas: JsonSchema[];
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
 * Para cada BuildRowsetFromJSON, associa o rowset a um path JSON e depois
 * mapeia os `Field()` calls que referenciam a variável de linha derivada.
 */
export function extractJsonSchemas(content: string): JsonSchema[] {
  // SET @rowsetVar = BuildRowsetFromJSON(@jsonVar, "$.path", ...)
  const rowsetRegex = /SET\s+@(\w+)\s*=\s*BuildRowsetFromJSON\s*\(\s*@(\w+)\s*,\s*["']([^"']+)["']/gi;
  // SET @rowVar = Row(@rowsetVar, ...)
  const rowRegex = /SET\s+@(\w+)\s*=\s*Row\s*\(\s*@(\w+)\s*,/gi;
  // Field(@rowVar, "campo")
  const fieldRegex = /Field\s*\(\s*@(\w+)\s*,\s*["'](\w+)["']\s*\)/gi;

  // rowsetVar → { jsonVar, path }
  const rowsetMap = new Map<string, { jsonVar: string; path: string }>();
  let m: RegExpExecArray | null;

  while ((m = rowsetRegex.exec(content)) !== null) {
    rowsetMap.set(m[1].toLowerCase(), { jsonVar: m[2].toLowerCase(), path: m[3] });
  }

  // rowVar → rowsetVar
  const rowMap = new Map<string, string>();
  while ((m = rowRegex.exec(content)) !== null) {
    rowMap.set(m[1].toLowerCase(), m[2].toLowerCase());
  }

  // jsonVar → path → Set<campo>
  const schemaMap = new Map<string, Map<string, Set<string>>>();

  while ((m = fieldRegex.exec(content)) !== null) {
    const rowVar = m[1].toLowerCase();
    const fieldName = m[2];

    const rowsetVar = rowMap.get(rowVar);
    if (!rowsetVar) continue;

    const rowsetInfo = rowsetMap.get(rowsetVar);
    if (!rowsetInfo) continue;

    const { jsonVar, path } = rowsetInfo;
    if (!schemaMap.has(jsonVar)) schemaMap.set(jsonVar, new Map());
    const pathMap = schemaMap.get(jsonVar)!;
    if (!pathMap.has(path)) pathMap.set(path, new Set());
    pathMap.get(path)!.add(fieldName);
  }

  const schemas: JsonSchema[] = [];
  for (const [variableName, pathMap] of schemaMap) {
    const paths: Record<string, string[]> = {};
    for (const [path, fields] of pathMap) {
      paths[path] = Array.from(fields);
    }
    schemas.push({ variableName, paths });
  }
  return schemas;
}

/**
 * Analisa o conteúdo de um asset e retorna os atributos necessários:
 * - `simpleAttributes`: atributos acessados via AttributeValue()
 * - `jsonSchemas`: variáveis JSON com paths e campos identificados via BuildRowsetFromJSON
 */
export function parseAssetAttributes(content: string): ParsedAssetAttributes {
  return {
    simpleAttributes: extractSimpleAttributes(content),
    jsonSchemas: extractJsonSchemas(content),
  };
}
