import { Injectable } from '@nestjs/common';
import { SfmcHttpService } from '../sfmc/sfmc-http.service';
import { CbService } from '../content-builder/cb.service';
import { parseAssetAttributes, ParsedAssetAttributes } from './ampscript-parser';

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

    return { definitions, count: definitions.length, page: 1, pageSize: options.pageSize };
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
    return this.http.get(`/messaging/v1/${channel}/messages/${encodeURIComponent(messageKey)}`);
  }

  // ─── Inspect ─────────────────────────────────────────────────────────────────

  async inspectEmailDefinition(definitionKey: string): Promise<{
    definition: Record<string, unknown>;
    asset: Record<string, unknown> | null;
    attributeSchema: ParsedAssetAttributes;
  }> {
    const definition = await this.getDefinition('email', definitionKey) as Record<string, unknown>;

    const content = definition['content'] as Record<string, unknown> | undefined;
    const customerKey = content?.['customerKey'] as string | undefined;

    let asset: Record<string, unknown> | null = null;
    let attributeSchema: ParsedAssetAttributes = { simpleAttributes: [], jsonSchemas: [] };

    if (customerKey) {
      asset = await this.cb.getAssetByCustomerKey(customerKey);
      if (asset) {
        const views = asset['views'] as Record<string, unknown> | undefined;
        const html = views?.['html'] as Record<string, unknown> | undefined;
        const htmlContent = (html?.['content'] as string | undefined) ?? '';
        attributeSchema = parseAssetAttributes(htmlContent);
      }
    }

    return { definition, asset, attributeSchema };
  }
}
