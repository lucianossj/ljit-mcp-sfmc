import { Injectable } from '@nestjs/common';
import { SfmcHttpService } from '../sfmc/sfmc-http.service';

export interface AssetListResponse {
  count: number;
  page: number;
  pageSize: number;
  items: Array<Record<string, unknown>>;
}

export interface AssetCreateBody {
  name: string;
  assetType: { id: number };
  content?: string;
  meta?: Record<string, unknown>;
  data?: Record<string, unknown>;
  category?: { id: number };
  description?: string;
}

@Injectable()
export class CbService {
  constructor(private readonly http: SfmcHttpService) {}

  async listAssets(options: {
    page?: number;
    pageSize?: number;
    assetTypeId?: number;
    query?: string;
  } = {}): Promise<AssetListResponse> {
    const params: Record<string, unknown> = {
      $page: options.page ?? 1,
      $pageSize: options.pageSize ?? 50,
    };
    if (options.assetTypeId) params.$filter = `assetType.id eq ${options.assetTypeId}`;
    if (options.query) params.$filter = `name like '%${options.query}%'`;

    return this.http.get<AssetListResponse>('/asset/v1/content/assets', params);
  }

  async getAsset(id: number): Promise<unknown> {
    return this.http.get(`/asset/v1/content/assets/${id}`);
  }

  async createAsset(body: AssetCreateBody): Promise<unknown> {
    return this.http.post('/asset/v1/content/assets', body);
  }

  async updateAsset(id: number, body: Partial<AssetCreateBody>): Promise<unknown> {
    return this.http.patch(`/asset/v1/content/assets/${id}`, body);
  }

  async deleteAsset(id: number): Promise<unknown> {
    return this.http.delete(`/asset/v1/content/assets/${id}`);
  }

  async listCategories(parentId?: number): Promise<unknown> {
    const params: Record<string, unknown> = {};
    if (parentId) params.$filter = `parentId eq ${parentId}`;
    return this.http.get('/asset/v1/content/categories', params);
  }

  async createCategory(name: string, parentId?: number): Promise<unknown> {
    return this.http.post('/asset/v1/content/categories', {
      name,
      ...(parentId && { parentId }),
    });
  }
}
