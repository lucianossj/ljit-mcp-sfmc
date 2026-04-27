import { Injectable } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { AuthService } from '../auth/auth.service';
import { SfmcApiError } from './sfmc-api.error';

const SOAP_TIMEOUT_MS = 30_000;

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

@Injectable()
export class SfmcSoapService {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    isArray: (name) => name === 'Results',
  });

  constructor(private readonly authService: AuthService) {}

  async soapRequest(action: string, bodyXml: string): Promise<Record<string, unknown>> {
    const { accessToken, soapBaseUrl } = await this.authService.getAccessToken();

    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Header>
    <fueloauth xmlns="http://exacttarget.com">${escapeXml(accessToken)}</fueloauth>
  </soap:Header>
  <soap:Body>${bodyXml}</soap:Body>
</soap:Envelope>`;

    try {
      const response = await axios.post<string>(`${soapBaseUrl}/Service.asmx`, envelope, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: action,
        },
        timeout: SOAP_TIMEOUT_MS,
        responseType: 'text',
      });

      const parsed = this.parser.parse(response.data) as Record<string, unknown>;
      return this.extractBody(parsed);
    } catch (err) {
      if (err instanceof AxiosError) {
        if (err.code === 'ECONNABORTED' || err.code === 'ERR_CANCELED') {
          throw new SfmcApiError(0, `SOAP timeout — ${action}`);
        }
        if (err.response) {
          try {
            const parsed = this.parser.parse(err.response.data as string) as Record<string, unknown>;
            const body = this.extractBody(parsed);
            const fault = this.dig(body, 'Fault') as Record<string, unknown> | undefined;
            if (fault) {
              throw new SfmcApiError(
                err.response.status,
                String(fault['faultstring'] ?? 'SOAP Fault'),
              );
            }
          } catch (parseErr) {
            if (parseErr instanceof SfmcApiError) throw parseErr;
          }
          throw new SfmcApiError(err.response.status, String(err.response.data).slice(0, 300));
        }
      }
      throw err;
    }
  }

  private extractBody(parsed: Record<string, unknown>): Record<string, unknown> {
    const envelope = this.dig(parsed, 'Envelope') as Record<string, unknown> | undefined;
    if (envelope) {
      const body = this.dig(envelope, 'Body') as Record<string, unknown> | undefined;
      if (body) return body;
    }
    return parsed;
  }

  private dig(obj: Record<string, unknown>, key: string): unknown {
    for (const k of Object.keys(obj)) {
      if (k === key || k.endsWith(`:${key}`)) return obj[k];
    }
    return undefined;
  }
}
