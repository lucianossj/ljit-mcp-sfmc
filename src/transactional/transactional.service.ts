import { Injectable } from '@nestjs/common';
import { SfmcHttpService } from '../sfmc/sfmc-http.service';
import { CbService } from '../content-builder/cb.service';
import { DeService } from '../data-extensions/de.service';
import { parseAssetAttributes, ParsedAssetAttributes, extractContentBlockIds } from './ampscript-parser';
import { enrichWithStatusDescription } from './transactional-error-codes';

export type Channel = 'email' | 'sms' | 'push';

export interface DefinitionListResponse {
  requestId?: string;
  definitions: Array<Record<string, unknown>>;
  count: number;
  page: number;
  pageSize: number;
}

export interface EmailDefinitionBody {
  definitionKey: string;
  name: string;
  description?: string;
  status?: 'Active' | 'Inactive';
  content: { customerKey: string };
  subscriptions: {
    dataExtension?: string;
    list?: string;
    autoAddSubscriber?: boolean;
    updateSubscriber?: boolean;
  };
  options?: {
    trackLinks?: boolean;
    cc?: string[];
    bcc?: string[];
  };
  fromEmail?: string;
  fromName?: string;
  subject?: string;
}

export interface SmsDefinitionBody {
  definitionKey: string;
  name: string;
  description?: string;
  status?: 'Active' | 'Inactive';
  content: { message: string };
  subscriptions: {
    shortCode: string;
    countryCode: string;
    keyword?: string;
    dataExtension?: string;
    autoAddSubscriber?: boolean;
    updateSubscriber?: boolean;
  };
}

export interface PushDefinitionBody {
  definitionKey: string;
  name: string;
  description?: string;
  status?: 'Active' | 'Inactive';
  content: {
    title: string;
    message: string;
    customKeys?: Record<string, string>;
    media?: { url: string; altText?: string };
  };
  subscriptions?: { dataExtension?: string };
}

@Injectable()
export class TransactionalService {
  constructor(
    private readonly http: SfmcHttpService,
    private readonly cb: CbService,
    private readonly de: DeService,
  ) {}

  // ─── Definition CRUD ────────────────────────────────────────────────────────

  async listDefinitions(
    channel: Channel,
    options: { page?: number; pageSize?: number; status?: string; nameFilter?: string; fetchAll?: boolean } = {},
  ): Promise<DefinitionListResponse> {
    const pageSize = options.pageSize ?? 50;

    if (options.fetchAll) {
      return this.listAllDefinitions(channel, { status: options.status, pageSize, nameFilter: options.nameFilter });
    }

    const params: Record<string, unknown> = {
      page: options.page ?? 1,
      pageSize,
    };
    if (options.status) params.status = options.status;

    const result = await this.http.get<DefinitionListResponse>(`/messaging/v1/${channel}/definitions`, params);

    if (options.nameFilter) {
      const prefix = options.nameFilter.toLowerCase();
      result.definitions = result.definitions.filter(d =>
        String(d['name'] ?? '').toLowerCase().startsWith(prefix),
      );
      result.count = result.definitions.length;
    }

    return result;
  }

  private async listAllDefinitions(
    channel: Channel,
    options: { status?: string; pageSize: number; nameFilter?: string },
  ): Promise<DefinitionListResponse> {
    const allDefinitions: Array<Record<string, unknown>> = [];
    let page = 1;
    const MAX_PAGES = 100;

    // Fetch first page to discover total count
    const firstParams: Record<string, unknown> = { page: 1, pageSize: options.pageSize };
    if (options.status) firstParams.status = options.status;

    const firstResult = await this.http.get<DefinitionListResponse>(
      `/messaging/v1/${channel}/definitions`,
      firstParams,
    );

    if (firstResult.definitions.length === 0) {
      return { definitions: [], count: 0, page: 1, pageSize: options.pageSize };
    }

    allDefinitions.push(...firstResult.definitions);

    // Use count from API response to calculate total pages when available
    const totalCount = firstResult.count ?? 0;
    const totalPages = totalCount > 0
      ? Math.ceil(totalCount / options.pageSize)
      : MAX_PAGES;

    page = 2;
    while (page <= Math.min(totalPages, MAX_PAGES)) {
      const params: Record<string, unknown> = { page, pageSize: options.pageSize };
      if (options.status) params.status = options.status;

      const result = await this.http.get<DefinitionListResponse>(
        `/messaging/v1/${channel}/definitions`,
        params,
      );

      if (result.definitions.length === 0) break;
      allDefinitions.push(...result.definitions);
      if (result.definitions.length < options.pageSize) break;
      page++;
    }

    if (page > MAX_PAGES) {
      process.stderr.write(
        `[sfmc] fetchAll reached MAX_PAGES (${MAX_PAGES}) for ${channel} definitions — results may be incomplete\n`,
      );
    }

    const definitions = options.nameFilter
      ? allDefinitions.filter(d =>
          String(d['name'] ?? '').toLowerCase().startsWith(options.nameFilter!.toLowerCase()),
        )
      : allDefinitions;

    // Deduplicar por definitionKey — a API pode retornar a mesma definition de múltiplas BUs
    const seen = new Set<string>();
    const deduplicated = definitions.filter((d) => {
      const key = String(d['definitionKey'] ?? '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { definitions: deduplicated, count: deduplicated.length, page: 1, pageSize: options.pageSize };
  }

  async getDefinition(channel: Channel, definitionKey: string): Promise<unknown> {
    return this.http.get(`/messaging/v1/${channel}/definitions/${encodeURIComponent(definitionKey)}`);
  }

  async createEmailDefinition(body: EmailDefinitionBody): Promise<unknown> {
    return this.http.post('/messaging/v1/email/definitions', body);
  }

  async createSmsDefinition(body: SmsDefinitionBody): Promise<unknown> {
    return this.http.post('/messaging/v1/sms/definitions', body);
  }

  async createPushDefinition(body: PushDefinitionBody): Promise<unknown> {
    return this.http.post('/messaging/v1/push/definitions', body);
  }

  async updateDefinition(
    channel: Channel,
    definitionKey: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.http.patch(
      `/messaging/v1/${channel}/definitions/${encodeURIComponent(definitionKey)}`,
      body,
    );
  }

  async deleteDefinition(channel: Channel, definitionKey: string): Promise<unknown> {
    return this.http.delete(
      `/messaging/v1/${channel}/definitions/${encodeURIComponent(definitionKey)}`,
    );
  }

  // ─── Send ────────────────────────────────────────────────────────────────────

  async sendEmail(
    messageKey: string,
    definitionKey: string,
    recipient: {
      contactKey: string;
      to: string;
      attributes?: Record<string, unknown>;
    },
  ): Promise<unknown> {
    return this.http.post(`/messaging/v1/email/messages/${encodeURIComponent(messageKey)}`, {
      definitionKey,
      recipient,
    });
  }

  async sendEmailBatch(
    definitionKey: string,
    recipients: Array<{ contactKey: string; to: string; attributes?: Record<string, unknown> }>,
  ): Promise<unknown> {
    return this.http.post('/messaging/v1/email/messages', {
      definitionKey,
      recipients,
    });
  }

  async sendSms(
    messageKey: string,
    definitionKey: string,
    recipient: {
      contactKey: string;
      to: string;
      attributes?: Record<string, unknown>;
    },
  ): Promise<unknown> {
    return this.http.post(`/messaging/v1/sms/messages/${encodeURIComponent(messageKey)}`, {
      definitionKey,
      recipient,
    });
  }

  async sendSmsBatch(
    definitionKey: string,
    recipients: Array<{ contactKey: string; to: string; attributes?: Record<string, unknown> }>,
  ): Promise<unknown> {
    return this.http.post('/messaging/v1/sms/messages', {
      definitionKey,
      recipients,
    });
  }

  async sendPush(
    messageKey: string,
    definitionKey: string,
    recipient: {
      contactKey: string;
      to?: string;
      attributes?: Record<string, unknown>;
    },
  ): Promise<unknown> {
    return this.http.post(`/messaging/v1/push/messages/${encodeURIComponent(messageKey)}`, {
      definitionKey,
      recipient,
    });
  }

  async getMessageStatus(channel: Channel, messageKey: string): Promise<unknown> {
    const response = await this.http.get<Record<string, unknown>>(
      `/messaging/v1/${channel}/messages/${encodeURIComponent(messageKey)}`,
    );
    return enrichWithStatusDescription(response);
  }

  // ─── Inspect ─────────────────────────────────────────────────────────────────

  /**
   * Resolve o conteúdo de um asset expandindo recursivamente CONTENTBLOCKBYID()
   * e CONTENTBLOCKBYNAME() presentes no conteúdo. Profundidade máxima: 3 níveis.
   */
  private async resolveAssetContent(
    rawContent: string,
    depth = 0,
    visited = new Set<number>(),
  ): Promise<string> {
    if (depth >= 3) return rawContent;

    const blockIds = extractContentBlockIds(rawContent);
    if (blockIds.length === 0) return rawContent;

    let resolved = rawContent;

    for (const id of blockIds) {
      if (visited.has(id)) continue;
      visited.add(id);

      try {
        const block = await this.cb.getAsset(id) as Record<string, unknown>;
        const views = block['views'] as Record<string, unknown> | undefined;
        const html = views?.['html'] as Record<string, unknown> | undefined;
        const blockContent = (html?.['content'] as string | undefined)
          ?? (block['content'] as string | undefined)
          ?? '';

        if (blockContent) {
          const expandedBlock = await this.resolveAssetContent(blockContent, depth + 1, visited);
          // Replace the CONTENTBLOCKBYID reference with the actual content
          const placeholder = new RegExp(
            `%%=\\s*CONTENTBLOCKBYID\\s*\\(\\s*["']?${id}["']?\\s*\\)\\s*=%%`,
            'gi',
          );
          resolved = resolved.replace(placeholder, expandedBlock);
        }
      } catch {
        // If block fetch fails, leave placeholder as-is
      }
    }

    return resolved;
  }

  async inspectEmailDefinition(definitionKey: string): Promise<{
    definition: Record<string, unknown>;
    asset: Record<string, unknown> | null;
    attributeSchema: ParsedAssetAttributes;
    deFields?: string[];
  }> {
    const definition = await this.getDefinition('email', definitionKey) as Record<string, unknown>;

    const content = definition['content'] as Record<string, unknown> | undefined;
    const customerKey = content?.['customerKey'] as string | undefined;

    let asset: Record<string, unknown> | null = null;
    let attributeSchema: ParsedAssetAttributes = {
      simpleAttributes: [],
      jsonSchemas: [],
      raisedErrors: [],
      contentBlockIds: [],
      contentBlockNames: [],
    };
    let deFields: string[] | undefined;

    if (customerKey) {
      asset = await this.cb.getAssetByCustomerKey(customerKey);
      if (asset) {
        const views = asset['views'] as Record<string, unknown> | undefined;
        const html = views?.['html'] as Record<string, unknown> | undefined;
        const rawContent = (html?.['content'] as string | undefined) ?? '';

        // Resolve content blocks recursively before parsing
        const expandedContent = await this.resolveAssetContent(rawContent);
        attributeSchema = parseAssetAttributes(expandedContent);
      }
    }

    // Auto-fetch DE fields for attribute validation hints
    const subscriptions = definition['subscriptions'] as Record<string, unknown> | undefined;
    const deKey = subscriptions?.['dataExtension'] as string | undefined;
    if (deKey) {
      try {
        deFields = await this.de.getDeFields(deKey);
      } catch {
        // Non-fatal — DE might not be accessible in this BU
      }
    }

    return { definition, asset, attributeSchema, ...(deFields && { deFields }) };
  }

  /**
   * Valida e normaliza os attribute names contra os campos da DE da definition.
   * Retorna os attributes com nomes normalizados (case matching) e alertas para campos não encontrados.
   */
  async validateAndNormalizeAttributes(
    definitionKey: string,
    attributes: Record<string, unknown>,
  ): Promise<{ normalized: Record<string, unknown>; warnings: string[] }> {
    const warnings: string[] = [];

    let deFields: string[] = [];
    try {
      const definition = await this.getDefinition('email', definitionKey) as Record<string, unknown>;
      const subscriptions = definition['subscriptions'] as Record<string, unknown> | undefined;
      const deKey = subscriptions?.['dataExtension'] as string | undefined;
      if (deKey) {
        deFields = await this.de.getDeFields(deKey);
      }
    } catch {
      return { normalized: attributes, warnings: ['Não foi possível buscar o schema da DE para validação.'] };
    }

    if (deFields.length === 0) {
      return { normalized: attributes, warnings };
    }

    const deFieldsLower = new Map(deFields.map((f) => [f.toLowerCase(), f]));
    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(attributes)) {
      const exactMatch = deFields.find((f) => f === key);
      if (exactMatch) {
        normalized[key] = value;
        continue;
      }

      const caseInsensitive = deFieldsLower.get(key.toLowerCase());
      if (caseInsensitive) {
        normalized[caseInsensitive] = value;
        warnings.push(`Atributo "${key}" normalizado para "${caseInsensitive}" (case da DE).`);
        continue;
      }

      normalized[key] = value;
      const candidates = deFields.filter((f) => f.toLowerCase().includes(key.toLowerCase().slice(0, 4)));
      warnings.push(
        `Atributo "${key}" não encontrado na DE.${candidates.length > 0 ? ` Possíveis matches: ${candidates.join(', ')}` : ''}`,
      );
    }

    return { normalized, warnings };
  }

  // ─── Send + Check ────────────────────────────────────────────────────────────

  /**
   * Envia um e-mail e aguarda o status final com polling (até maxAttempts tentativas).
   * Retorna o resultado do envio + o status final consolidado.
   */
  async sendEmailAndCheck(
    messageKey: string,
    definitionKey: string,
    recipient: {
      contactKey: string;
      to: string;
      attributes?: Record<string, unknown>;
    },
    options: { maxAttempts?: number; intervalMs?: number } = {},
  ): Promise<{
    send: unknown;
    status: unknown;
    messageKey: string;
  }> {
    const { maxAttempts = 4, intervalMs = 2000 } = options;

    const send = await this.sendEmail(messageKey, definitionKey, recipient);

    // Poll for final status
    let status: unknown = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      try {
        const result = await this.getMessageStatus('email', messageKey);
        const r = result as Record<string, unknown>;
        // Terminal states
        const event = String(r['eventCategoryType'] ?? '');
        if (
          event.includes('Sent') ||
          event.includes('Bounce') ||
          event.includes('NotSent') ||
          event.includes('Error') ||
          r['statusCode'] !== undefined
        ) {
          status = result;
          break;
        }
        status = result;
      } catch {
        // Status not yet available — retry
      }
    }

    return { send, status, messageKey };
  }
}
