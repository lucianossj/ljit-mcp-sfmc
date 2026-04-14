import {
  extractSimpleAttributes,
  extractJsonSchemas,
  extractRaiseErrorGuards,
  extractContentBlockIds,
  extractContentBlockNames,
  parseAssetAttributes,
} from './ampscript-parser';

describe('extractSimpleAttributes', () => {
  it('extrai atributos simples com aspas duplas', () => {
    const content = `
      SET @email = AttributeValue("EmailAddress")
      SET @name  = AttributeValue("FirstName")
    `;
    expect(extractSimpleAttributes(content)).toEqual(
      expect.arrayContaining(['EmailAddress', 'FirstName']),
    );
  });

  it('extrai atributos com aspas simples', () => {
    const content = `SET @v = AttributeValue('SubscriberKey')`;
    expect(extractSimpleAttributes(content)).toContain('SubscriberKey');
  });

  it('desduplicta atributos repetidos', () => {
    const content = `
      AttributeValue("json")
      AttributeValue("json")
    `;
    const result = extractSimpleAttributes(content);
    expect(result.filter(a => a === 'json')).toHaveLength(1);
  });

  it('retorna array vazio quando não há AttributeValue', () => {
    expect(extractSimpleAttributes('<html>sem ampscript</html>')).toEqual([]);
  });
});

describe('extractJsonSchemas', () => {
  const sampleContent = `
    SET @json = AttributeValue("json")

    SET @clientRowset = BuildRowsetFromJSON(@json, "$.client", 0)
    SET @clientRow = Row(@clientRowset, 1)
    SET @name = Field(@clientRow, "name")
    SET @doc  = Field(@clientRow, "document")

    SET @itemsRowset = BuildRowsetFromJSON(@json, "$.items[*]", 0)
    SET @itemRow = Row(@itemsRowset, 1)
    SET @sku   = Field(@itemRow, "sku")
    SET @price = Field(@itemRow, "price")
  `;

  it('extrai schemas corretamente', () => {
    const schemas = extractJsonSchemas(sampleContent);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].variableName).toBe('json');
  });

  it('mapeia path $.client com campos name e document', () => {
    const schemas = extractJsonSchemas(sampleContent);
    const paths = schemas[0].paths;
    expect(paths['$.client']).toEqual(expect.arrayContaining(['name', 'document']));
  });

  it('mapeia path $.items[*] com campos sku e price', () => {
    const schemas = extractJsonSchemas(sampleContent);
    const paths = schemas[0].paths;
    expect(paths['$.items[*]']).toEqual(expect.arrayContaining(['sku', 'price']));
  });

  it('retorna array vazio quando não há BuildRowsetFromJSON', () => {
    expect(extractJsonSchemas('<html>sem ampscript</html>')).toEqual([]);
  });

  it('detecta paths dinâmicos via Concat e infere path base', () => {
    const content = `
      SET @json = AttributeValue("json")
      FOR @P = 1 TO @count DO
        SET @dynRowset = BuildRowsetFromJSON(@json, Concat("$.products[", Subtract(@P, 1), "]"), 0)
        SET @dynRow = Row(@dynRowset, 1)
        SET @code = Field(@dynRow, "code")
        SET @qty  = Field(@dynRow, "quantity")
      NEXT @P
    `;
    const schemas = extractJsonSchemas(content);
    const jsonSchema = schemas.find(s => s.variableName === 'json');
    expect(jsonSchema).toBeDefined();
    expect(jsonSchema!.dynamicPaths).toBeDefined();
    const dynPaths = jsonSchema!.dynamicPaths!;
    const dynKey = Object.keys(dynPaths)[0];
    expect(dynKey).toMatch(/products\[\*\]/);
    expect(dynPaths[dynKey]).toEqual(expect.arrayContaining(['code', 'quantity']));
  });
});

describe('extractRaiseErrorGuards', () => {
  it('extrai mensagens de RaiseError', () => {
    const content = `
      IF RowCount(@prodRowset) == 0 THEN
        RaiseError("Erro no json de produtos")
      ENDIF
      IF RowCount(@payRowset) == 0 THEN
        RaiseError("Erro no json de Pagamento")
      ENDIF
    `;
    const guards = extractRaiseErrorGuards(content);
    expect(guards).toHaveLength(2);
    expect(guards.map(g => g.message)).toEqual(
      expect.arrayContaining(['Erro no json de produtos', 'Erro no json de Pagamento']),
    );
  });

  it('identifica variável guardada no contexto IF', () => {
    const content = `
      SET @cartRowset = BuildRowsetFromJSON(@json, "$.shoppingCart", 0)
      IF RowCount(@cartRowset) == 0 THEN
        RaiseError("Erro no carrinho")
      ENDIF
    `;
    const guards = extractRaiseErrorGuards(content);
    expect(guards[0].guardedVariable).toBeTruthy();
  });

  it('retorna array vazio quando não há RaiseError', () => {
    expect(extractRaiseErrorGuards('<html>sem ampscript</html>')).toEqual([]);
  });
});

describe('extractContentBlockIds', () => {
  it('extrai IDs numéricos de CONTENTBLOCKBYID', () => {
    const content = `%%=CONTENTBLOCKBYID("58985")=%% %%=CONTENTBLOCKBYID("12345")=%%`;
    expect(extractContentBlockIds(content)).toEqual(expect.arrayContaining([58985, 12345]));
  });

  it('funciona com aspas simples e sem aspas', () => {
    const content = `%%=CONTENTBLOCKBYID('999')=%% %%=CONTENTBLOCKBYID(100)=%%`;
    expect(extractContentBlockIds(content)).toEqual(expect.arrayContaining([999, 100]));
  });

  it('desduplicata IDs repetidos', () => {
    const content = `%%=CONTENTBLOCKBYID("100")=%% %%=CONTENTBLOCKBYID("100")=%%`;
    expect(extractContentBlockIds(content)).toHaveLength(1);
  });

  it('retorna array vazio quando não há CONTENTBLOCKBYID', () => {
    expect(extractContentBlockIds('<html>nada</html>')).toEqual([]);
  });
});

describe('extractContentBlockNames', () => {
  it('extrai nomes de CONTENTBLOCKBYNAME', () => {
    const content = `%%=CONTENTBLOCKBYNAME("email/header")=%% %%=CONTENTBLOCKBYNAME("email/footer")=%%`;
    expect(extractContentBlockNames(content)).toEqual(
      expect.arrayContaining(['email/header', 'email/footer']),
    );
  });
});

describe('parseAssetAttributes', () => {
  it('retorna simpleAttributes, jsonSchemas, raisedErrors e contentBlockIds', () => {
    const content = `
      SET @env = AttributeValue("environment")
      SET @rows = BuildRowsetFromJSON(@json, "$.order", 0)
      SET @row  = Row(@rows, 1)
      SET @id   = Field(@row, "orderId")
      IF RowCount(@rows) == 0 THEN RaiseError("Erro no pedido") ENDIF
      %%=CONTENTBLOCKBYID("999")=%%
    `;
    const result = parseAssetAttributes(content);
    expect(result.simpleAttributes).toContain('environment');
    expect(result.jsonSchemas).toHaveLength(1);
    expect(result.jsonSchemas[0].paths['$.order']).toContain('orderId');
    expect(result.raisedErrors).toHaveLength(1);
    expect(result.raisedErrors[0].message).toBe('Erro no pedido');
    expect(result.contentBlockIds).toContain(999);
  });
});
