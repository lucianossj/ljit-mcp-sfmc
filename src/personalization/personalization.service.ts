import { Injectable } from '@nestjs/common';
import { PersAuthService } from './pers-auth.service';
import { PersHttpService } from './pers-http.service';

export interface ExportOptions {
  /** Dataset alvo. Default: MCP_PERS_DATASET. */
  dataset?: string;
  /** Nome ou ID de segmento para filtrar. */
  filter?: string;
  /** Início da janela de estatísticas de engajamento (epoch ms). */
  start?: number;
  /** Fim da janela de estatísticas de engajamento (epoch ms). */
  end?: number;
  segmentationId?: string;
  segmentId?: string;
  /** Registros por página. */
  pageSize?: number;
  /** Página (zero-indexed). */
  page?: number;
  /** Inclui detalhes de geolocalização. */
  includeGeo?: boolean;
}

export interface AuditLogOptions {
  page?: number;
  /** Máx 2000. */
  pageSize?: number;
  /** ISO-8601. Default: 7 dias atrás. */
  startDate?: string;
  /** ISO-8601. Default: hoje. Range máx 50 dias. */
  endDate?: string;
}

/**
 * Marketing Cloud Personalization — apenas operações de LEITURA.
 * Write (eventos/recomendações) e delete (GDPR) ficam fora deste service
 * enquanto a integração aponta para dados de produção.
 */
@Injectable()
export class PersonalizationService {
  constructor(
    private readonly auth: PersAuthService,
    private readonly http: PersHttpService,
  ) {}

  private dataset(override?: string): string {
    return override ?? this.auth.defaultDataset;
  }

  private exportParams(opts: ExportOptions): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    if (opts.filter !== undefined) params.filter = opts.filter;
    if (opts.start !== undefined) params.start = opts.start;
    if (opts.end !== undefined) params.end = opts.end;
    if (opts.segmentationId !== undefined) params.segmentationId = opts.segmentationId;
    if (opts.segmentId !== undefined) params.segmentId = opts.segmentId;
    if (opts.pageSize !== undefined) params.pageSize = opts.pageSize;
    if (opts.page !== undefined) params.page = opts.page;
    if (opts.includeGeo !== undefined) params.includeGeo = opts.includeGeo;
    return params;
  }

  /** GET /api/dataset/<dataset>/users.json — exporta users (uma página). */
  exportUsers(opts: ExportOptions = {}): Promise<unknown> {
    const ds = encodeURIComponent(this.dataset(opts.dataset));
    return this.http.get(`/api/dataset/${ds}/users.json`, {
      params: this.exportParams(opts),
    });
  }

  /** GET /api/dataset/<dataset>/accounts.json — exporta accounts (uma página). */
  exportAccounts(opts: ExportOptions = {}): Promise<unknown> {
    const ds = encodeURIComponent(this.dataset(opts.dataset));
    return this.http.get(`/api/dataset/${ds}/accounts.json`, {
      params: this.exportParams(opts),
    });
  }

  /** GET /api/dataset/<dataset>/user/<id> — busca um user por primary ID ou anonymous ID. */
  lookupUser(userId: string, dataset?: string): Promise<unknown> {
    const ds = encodeURIComponent(this.dataset(dataset));
    const id = encodeURIComponent(userId);
    return this.http.get(`/api/dataset/${ds}/user/${id}`);
  }

  /** GET /api/audit/list — logs de acesso/atividade (range máx 50 dias). */
  auditLog(opts: AuditLogOptions = {}): Promise<unknown> {
    const params: Record<string, unknown> = {};
    if (opts.page !== undefined) params.page = opts.page;
    if (opts.pageSize !== undefined) params.pageSize = opts.pageSize;
    if (opts.startDate !== undefined) params.startDate = opts.startDate;
    if (opts.endDate !== undefined) params.endDate = opts.endDate;
    return this.http.get('/api/audit/list', { params });
  }
}
