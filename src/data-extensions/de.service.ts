import { Injectable } from '@nestjs/common';
import { SfmcHttpService } from '../sfmc/sfmc-http.service';

export interface DeRow {
  keys: Record<string, unknown>;
  values: Record<string, unknown>;
}

export interface DeRowsResponse {
  count: number;
  page: number;
  pageSize: number;
  items: Array<Record<string, unknown>>;
}

export interface DeListResponse {
  count: number;
  page: number;
  pageSize: number;
  items: Array<{
    id: string;
    name: string;
    externalKey: string;
    description?: string;
    isSendable?: boolean;
    isTestable?: boolean;
    categoryId?: number;
    rowCount?: number;
  }>;
}

export interface DeCreateBody {
  name: string;
  externalKey?: string;
  description?: string;
  isSendable?: boolean;
  sendableDataExtensionField?: { name: string };
  sendableSubscriberField?: { name: string };
  fields: Array<{
    name: string;
    fieldType: string;
    maxLength?: number;
    isPrimaryKey?: boolean;
    isRequired?: boolean;
    defaultValue?: string;
  }>;
}

@Injectable()
export class DeService {
  constructor(private readonly http: SfmcHttpService) {}

  async listDataExtensions(
    options: { page?: number; pageSize?: number; nameFilter?: string } = {},
  ): Promise<DeListResponse> {
    if (!options.nameFilter) {
      throw new Error(
        'nameFilter é obrigatório para listar Data Extensions. Informe um trecho do nome para busca.',
      );
    }
    const DE_MAX_PAGE_SIZE = 500;
    const params: Record<string, unknown> = {
      $page: options.page ?? 1,
      $pageSize: Math.min(options.pageSize ?? 50, DE_MAX_PAGE_SIZE),
      $search: options.nameFilter,
    };

    const raw = await this.http.get<{ count: number; page: number; pageSize: number; items: Array<Record<string, unknown>> }>(
      '/data/v1/customobjects',
      params,
    );

    return {
      count: raw.count,
      page: raw.page,
      pageSize: raw.pageSize,
      items: (raw.items ?? []).map((item) => ({
        id: item['id'] as string,
        name: item['name'] as string,
        externalKey: item['key'] as string,
        description: item['description'] as string | undefined,
        isSendable: item['isSendable'] as boolean | undefined,
        isTestable: item['isTestable'] as boolean | undefined,
        categoryId: item['categoryId'] as number | undefined,
        rowCount: item['rowCount'] as number | undefined,
      })),
    };
  }

  async listRows(
    externalKey: string,
    options: { page?: number; pageSize?: number; filter?: string } = {},
  ): Promise<DeRowsResponse> {
    const params: Record<string, unknown> = {
      $page: options.page ?? 1,
      $pageSize: options.pageSize ?? 50,
    };
    if (options.filter) params.$filter = options.filter;

    return this.http.get<DeRowsResponse>(
      `/data/v1/customobjectdata/key/${encodeURIComponent(externalKey)}/rowset`,
      params,
    );
  }

  async upsertRows(
    externalKey: string,
    items: Array<Record<string, unknown>>,
  ): Promise<unknown> {
    return this.http.post(
      `/data/v1/customobjectdata/key/${encodeURIComponent(externalKey)}/rowset`,
      items,
    );
  }

  async deleteRows(
    externalKey: string,
    keys: Array<Record<string, unknown>>,
  ): Promise<unknown> {
    return this.http.delete(
      `/data/v1/customobjectdata/key/${encodeURIComponent(externalKey)}/rowset`,
    );
  }

  async createDataExtension(body: DeCreateBody): Promise<unknown> {
    const payload: Record<string, unknown> = {
      name: body.name,
      fields: body.fields,
    };
    if (body.externalKey) payload['key'] = body.externalKey;
    if (body.description) payload['description'] = body.description;
    if (body.isSendable !== undefined) payload['isSendable'] = body.isSendable;
    if (body.sendableDataExtensionField)
      payload['sendableCustomObjectField'] = body.sendableDataExtensionField.name;
    if (body.sendableSubscriberField)
      payload['sendableSubscriberField'] = body.sendableSubscriberField.name;
    return this.http.post('/data/v1/customobjects', payload);
  }

  async getDataExtension(externalKey: string): Promise<unknown> {
    const result = await this.http.get<{
      items: Array<Record<string, unknown>>;
    }>('/data/v1/customobjects', { $search: externalKey, $page: 1, $pageSize: 50 });

    const match = (result.items ?? []).find((item) => item['key'] === externalKey);
    if (!match) {
      throw new Error(`Data Extension com chave '${externalKey}' não encontrada`);
    }
    return this.http.get(`/data/v1/customobjects/${match['id']}`);
  }

  /**
   * Retorna metadados completos dos campos de uma Data Extension.
   * Inclui name, isRequired, isPrimaryKey, fieldType e defaultValue.
   */
  async getDeFieldsWithMetadata(externalKey: string): Promise<Array<{
    name: string;
    isRequired: boolean;
    isPrimaryKey: boolean;
    fieldType: string;
    defaultValue?: string;
  }>> {
    const raw = await this.getDataExtension(externalKey) as Record<string, unknown>;
    const fields = (raw['fields'] as Array<Record<string, unknown>> | undefined) ?? [];
    return fields
      .filter((f) => Boolean(f['name']))
      .map((f) => ({
        name: f['name'] as string,
        isRequired: Boolean(f['isRequired']),
        isPrimaryKey: Boolean(f['isPrimaryKey']),
        fieldType: String(f['fieldType'] ?? 'Text'),
        defaultValue: f['defaultValue'] as string | undefined,
      }));
  }

  /**
   * Retorna a lista de nomes de campos de uma Data Extension pelo externalKey.
   * Útil para validar/normalizar attribute names antes de um envio transacional.
   */
  async getDeFields(externalKey: string): Promise<string[]> {
    const fields = await this.getDeFieldsWithMetadata(externalKey);
    return fields.map((f) => f.name);
  }

  /**
   * Resolve os campos de uma DE tentando múltiplas estratégias em cascata.
   * Usa a primeira que retornar dados. Nunca lança exceção — retorna array vazio se tudo falhar.
   *
   * Estratégias (em ordem):
   * 1. Schema formal via getDeFieldsWithMetadata(externalKey)
   * 2. Amostra de 1 row via listRows — infere campos pelos values do primeiro item
   * 3. Busca por nome via listDataExtensions — o externalKey pode ser o nome da DE
   * 4. Variações do nome: DEX_<key>, <key com - trocado por _>, sem prefixo DEX_/DE_
   */
  async resolveDeFieldsWithFallback(externalKey: string): Promise<{
    fields: Array<{ name: string; isRequired: boolean; isPrimaryKey: boolean; fieldType: string; defaultValue?: string }>;
    resolvedVia: string | null;
  }> {
    // Estratégia 1: schema formal pelo externalKey
    try {
      const fields = await this.getDeFieldsWithMetadata(externalKey);
      if (fields.length > 0) return { fields, resolvedVia: 'schema' };
    } catch { /* fallthrough */ }

    // Estratégia 2: inferir campos pelo values do primeiro row
    try {
      const rows = await this.listRows(externalKey, { pageSize: 1 });
      const firstItem = rows.items?.[0];
      if (firstItem) {
        const values = (firstItem['values'] ?? firstItem) as Record<string, unknown>;
        const fields = Object.keys(values).map((name) => ({
          name,
          isRequired: false,
          isPrimaryKey: false,
          fieldType: 'Text' as const,
        }));
        if (fields.length > 0) return { fields, resolvedVia: 'row-sample' };
      }
    } catch { /* fallthrough */ }

    // Estratégias 3 e 4: busca por variações do nome/key
    const candidates = this.buildKeyVariations(externalKey);
    for (const candidate of candidates) {
      // Tenta schema formal com a variação
      try {
        const fields = await this.getDeFieldsWithMetadata(candidate);
        if (fields.length > 0) return { fields, resolvedVia: `schema:${candidate}` };
      } catch { /* fallthrough */ }

      // Tenta listRows com a variação
      try {
        const rows = await this.listRows(candidate, { pageSize: 1 });
        const firstItem = rows.items?.[0];
        if (firstItem) {
          const values = (firstItem['values'] ?? firstItem) as Record<string, unknown>;
          const fields = Object.keys(values).map((name) => ({
            name,
            isRequired: false,
            isPrimaryKey: false,
            fieldType: 'Text' as const,
          }));
          if (fields.length > 0) return { fields, resolvedVia: `row-sample:${candidate}` };
        }
      } catch { /* fallthrough */ }
    }

    return { fields: [], resolvedVia: null };
  }

  private buildKeyVariations(externalKey: string): string[] {
    const variations = new Set<string>();
    const normalized = externalKey.replace(/-/g, '_');

    // Troca hífens por underscores
    if (normalized !== externalKey) variations.add(normalized);

    // Adiciona prefixo DEX_
    variations.add(`DEX_${externalKey}`);
    variations.add(`DEX_${normalized}`);

    // Remove prefixos comuns
    for (const prefix of ['DEX_', 'DE_', 'DEX-', 'DE-']) {
      if (externalKey.toUpperCase().startsWith(prefix)) {
        variations.add(externalKey.slice(prefix.length));
        variations.add(externalKey.slice(prefix.length).replace(/-/g, '_'));
      }
    }

    return [...variations].filter((v) => v !== externalKey);
  }
}
