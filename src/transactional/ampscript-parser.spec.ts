import {
  extractSimpleAttributes,
  extractJsonSchemas,
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
});

describe('parseAssetAttributes', () => {
  it('retorna tanto simpleAttributes quanto jsonSchemas', () => {
    const content = `
      SET @env = AttributeValue("environment")
      SET @rows = BuildRowsetFromJSON(@json, "$.order", 0)
      SET @row  = Row(@rows, 1)
      SET @id   = Field(@row, "orderId")
    `;
    const result = parseAssetAttributes(content);
    expect(result.simpleAttributes).toContain('environment');
    expect(result.jsonSchemas).toHaveLength(1);
    expect(result.jsonSchemas[0].paths['$.order']).toContain('orderId');
  });
});
