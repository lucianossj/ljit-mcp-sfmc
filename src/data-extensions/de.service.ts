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
    const params: Record<string, unknown> = {
      $page: options.page ?? 1,
      $pageSize: options.pageSize ?? 50,
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
}
