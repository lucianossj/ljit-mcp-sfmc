import { Injectable } from '@nestjs/common';
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { PersAuthService } from './pers-auth.service';
import { parsePersError, PersApiError } from './pers-api.error';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RequestOptions {
  params?: Record<string, unknown>;
  /** Header overrides (e.g. multipart Content-Type from FormData). */
  headers?: Record<string, string>;
  /** Skip the Basic auth header — for the unauthenticated /api2/event endpoint. */
  skipAuth?: boolean;
  /** axios responseType — 'json' (default) or 'text'/'arraybuffer' for exports. */
  responseType?: AxiosRequestConfig['responseType'];
}

@Injectable()
export class PersHttpService {
  private get timeoutMs(): number {
    const env = process.env.MCP_PERS_REQUEST_TIMEOUT_MS;
    const parsed = env ? parseInt(env, 10) : NaN;
    return isNaN(parsed) ? DEFAULT_TIMEOUT_MS : parsed;
  }

  constructor(private readonly auth: PersAuthService) {}

  get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  post<T>(path: string, data?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, data, options);
  }

  private async request<T>(
    method: string,
    path: string,
    data: unknown,
    options: RequestOptions,
    attempt = 1,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (!options.skipAuth) {
      headers.Authorization = this.auth.authorizationHeader;
    }

    try {
      const response = await axios.request<T>({
        method,
        url: `${this.auth.baseUrl}${path}`,
        headers,
        params: options.params,
        data,
        responseType: options.responseType,
        timeout: this.timeoutMs,
      });
      return response.data;
    } catch (err) {
      if (err instanceof AxiosError) {
        if (err.code === 'ECONNABORTED' || err.code === 'ERR_CANCELED') {
          throw new PersApiError(
            0,
            `Request timeout after ${this.timeoutMs / 1000}s — ${method} ${path}`,
          );
        }

        if (err.response) {
          const status = err.response.status;

          if (RETRYABLE_STATUS.has(status) && attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            process.stderr.write(
              `[pers] ${status} on ${method} ${path} — retry ${attempt}/${MAX_RETRIES - 1} in ${delay}ms\n`,
            );
            await sleep(delay);
            return this.request<T>(method, path, data, options, attempt + 1);
          }

          throw parsePersError(status, err.response.data);
        }
      }
      throw err;
    }
  }
}
