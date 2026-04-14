import { Injectable } from '@nestjs/common';
import axios from 'axios';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  rest_instance_url: string;
  soap_instance_url: string;
}

interface CachedToken {
  accessToken: string;
  restBaseUrl: string;
  expiresAt: number;
}

@Injectable()
export class AuthService {
  private cachedToken: CachedToken | null = null;

  private get clientId(): string {
    const v = process.env.SFMC_CLIENT_ID;
    if (!v) throw new Error('SFMC_CLIENT_ID env var is required');
    return v;
  }

  private get clientSecret(): string {
    const v = process.env.SFMC_CLIENT_SECRET;
    if (!v) throw new Error('SFMC_CLIENT_SECRET env var is required');
    return v;
  }

  private get subdomain(): string {
    const v = process.env.SFMC_SUBDOMAIN;
    if (!v) throw new Error('SFMC_SUBDOMAIN env var is required');
    return v;
  }

  private get accountId(): string | undefined {
    return process.env.SFMC_ACCOUNT_ID || undefined;
  }

  private get authUrl(): string {
    return `https://${this.subdomain}.auth.marketingcloudapis.com/v2/token`;
  }

  async getAccessToken(): Promise<{ accessToken: string; restBaseUrl: string }> {
    const now = Date.now();
    // Refresh 60 seconds before expiry
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return {
        accessToken: this.cachedToken.accessToken,
        restBaseUrl: this.cachedToken.restBaseUrl,
      };
    }

    const body: Record<string, string> = {
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    };

    if (this.accountId) {
      body.account_id = this.accountId;
    }

    const response = await axios.post<TokenResponse>(this.authUrl, body, {
      headers: { 'Content-Type': 'application/json' },
    });

    const { access_token, expires_in, rest_instance_url } = response.data;

    this.cachedToken = {
      accessToken: access_token,
      restBaseUrl: rest_instance_url.replace(/\/$/, ''),
      expiresAt: now + expires_in * 1000,
    };

    return {
      accessToken: this.cachedToken.accessToken,
      restBaseUrl: this.cachedToken.restBaseUrl,
    };
  }
}
