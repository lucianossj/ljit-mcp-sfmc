import { Injectable } from '@nestjs/common';
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { AuthService } from '../auth/auth.service';
import { parseSfmcError, SfmcApiError } from './sfmc-api.error';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class SfmcHttpService {
  private get timeoutMs(): number {
    const env = process.env.SFMC_REQUEST_TIMEOUT_MS;
    const parsed = env ? parseInt(env, 10) : NaN;
    return isNaN(parsed) ? DEFAULT_TIMEOUT_MS : parsed;
  }

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
    attempt = 1,
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
        timeout: this.timeoutMs,
        ...config,
      });
      return response.data;
    } catch (err) {
      if (err instanceof AxiosError) {
        // Timeout
        if (err.code === 'ECONNABORTED' || err.code === 'ERR_CANCELED') {
          throw new SfmcApiError(
            0,
            `Request timeout after ${this.timeoutMs / 1000}s — ${method} ${path}`,
          );
        }

        if (err.response) {
          const status = err.response.status;

          // Retry for transient errors
          if (RETRYABLE_STATUS.has(status) && attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            process.stderr.write(
              `[sfmc] ${status} on ${method} ${path} — retry ${attempt}/${MAX_RETRIES - 1} in ${delay}ms\n`,
            );
            await sleep(delay);
            return this.request<T>(method, path, config, attempt + 1);
          }

          throw parseSfmcError(status, err.response.data);
        }
      }
      throw err;
    }
  }
}
