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
    return this.http.post('/data/v1/customobjectdata', body);
  }

  async getDataExtension(externalKey: string): Promise<unknown> {
    return this.http.get(
      `/data/v1/customobjectdata/key/${encodeURIComponent(externalKey)}`,
    );
  }
}
