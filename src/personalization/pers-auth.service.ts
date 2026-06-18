import { Injectable } from '@nestjs/common';

/**
 * Marketing Cloud Personalization (ex-Interaction Studio / Evergage).
 * Produto separado do SFMC core: auth e base URL diferentes.
 *
 * Auth: header `Authorization: Basic base64(apiKeyId:apiKeySecret)` — token
 * estático gerado na UI (Security > API Tokens), sem refresh.
 *
 * Base URL: `https://<account>.<instance>.evergage.com` — ou override completo
 * via MCP_PERS_BASE_URL para contas em domínio consolidado.
 */
@Injectable()
export class PersAuthService {
  private requireEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`${name} env var is required`);
    return v;
  }

  get defaultDataset(): string {
    return this.requireEnv('MCP_PERS_DATASET');
  }

  get baseUrl(): string {
    const override = process.env.MCP_PERS_BASE_URL;
    if (override) return override.replace(/\/$/, '');

    const account = this.requireEnv('MCP_PERS_ACCOUNT');
    const instance = this.requireEnv('MCP_PERS_INSTANCE');
    return `https://${account}.${instance}.evergage.com`;
  }

  get authorizationHeader(): string {
    const apiKeyId = this.requireEnv('MCP_PERS_API_KEY_ID');
    const apiSecret = this.requireEnv('MCP_PERS_API_SECRET');
    const token = Buffer.from(`${apiKeyId}:${apiSecret}`).toString('base64');
    return `Basic ${token}`;
  }
}
