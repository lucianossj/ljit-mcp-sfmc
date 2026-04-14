import { Injectable } from '@nestjs/common';
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { AuthService } from '../auth/auth.service';
import { parseSfmcError } from './sfmc-api.error';

@Injectable()
export class SfmcHttpService {
  constructor(private readonly authService: AuthService) {}

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', path, { params });
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>('POST', path, { data });
  }

  async patch<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, { data });
  }

  async put<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>('PUT', path, { data });
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(
    method: string,
    path: string,
    config: Partial<AxiosRequestConfig> = {},
  ): Promise<T> {
    const { accessToken, restBaseUrl } = await this.authService.getAccessToken();

    try {
      const response = await axios.request<T>({
        method,
        url: `${restBaseUrl}${path}`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        ...config,
      });
      return response.data;
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        throw parseSfmcError(err.response.status, err.response.data);
      }
      throw err;
    }
  }
}
