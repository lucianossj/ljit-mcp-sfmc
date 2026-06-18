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

  /**
   * Retrieve genérico via SOAP com paginação automática: enquanto
   * OverallStatus = "MoreDataAvailable", reenvia com <ContinueRequest>{RequestID}</ContinueRequest>
   * e consolida todos os Results. Reutilizável para qualquer ObjectType (DataFolder, DataExtension…).
   */
  async retrieve(
    objectType: string,
    properties: string[],
    filterXml = '',
  ): Promise<{ results: Array<Record<string, unknown>>; overallStatus: string; truncated: boolean }> {
    const props = properties.map((p) => `<Properties>${p}</Properties>`).join('');
    const wrap = (inner: string) =>
      `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"><RetrieveRequest>${inner}</RetrieveRequest></RetrieveRequestMsg>`;

    const MAX_CONTINUES = 40;
    const results: Array<Record<string, unknown>> = [];

    let page = this.parseRetrieve(
      await this.soapRequest('Retrieve', wrap(`<ObjectType>${objectType}</ObjectType>${props}${filterXml}`)),
    );
    results.push(...page.results);

    let continues = 0;
    while (page.overallStatus === 'MoreDataAvailable' && page.requestId && continues < MAX_CONTINUES) {
      page = this.parseRetrieve(
        await this.soapRequest(
          'Retrieve',
          wrap(`<ContinueRequest>${escapeXml(page.requestId)}</ContinueRequest><ObjectType>${objectType}</ObjectType>${props}`),
        ),
      );
      results.push(...page.results);
      continues++;
    }

    const truncated = page.overallStatus === 'MoreDataAvailable' && continues >= MAX_CONTINUES;
    if (truncated) {
      process.stderr.write(
        `[sfmc] SOAP retrieve ${objectType} atingiu MAX_CONTINUES (${MAX_CONTINUES}) — resultado pode estar incompleto\n`,
      );
    }
    return { results, overallStatus: page.overallStatus, truncated };
  }

  private parseRetrieve(body: Record<string, unknown>): {
    results: Array<Record<string, unknown>>;
    overallStatus: string;
    requestId?: string;
  } {
    const msg = (this.dig(body, 'RetrieveResponseMsg') as Record<string, unknown> | undefined) ?? body;
    const raw = msg['Results'];
    const results = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<Record<string, unknown>>;
    const overallStatus = String(msg['OverallStatus'] ?? '');
    if (overallStatus.startsWith('Error')) {
      throw new SfmcApiError(400, `SOAP Retrieve falhou: ${overallStatus}`);
    }
    return {
      results,
      overallStatus,
      requestId: msg['RequestID'] ? String(msg['RequestID']) : undefined,
    };
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
