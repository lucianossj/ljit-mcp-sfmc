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

export interface MetricsSummaryOptions {
  dataset?: string;
  /** Nome ou ID de segmento para limitar a amostra. */
  filter?: string;
  segmentId?: string;
  /** Janela (em dias) para considerar um usuário "ativo" pela lastActivity. Default 30. */
  activeWithinDays?: number;
  /** Teto de registros agregados. Default 1000, máx 50000. */
  maxRecords?: number;
  pageSize?: number;
}

export interface MetricsSummary {
  /** Quantidade de usuários efetivamente agregados. */
  sampledUsers: number;
  /** true quando atingiu maxRecords — há mais dados além da amostra. */
  truncated: boolean;
  activeWithinDays: number;
  engagement: {
    withScore: number;
    average: number;
    min: number | null;
    max: number | null;
    distribution: Record<string, number>;
  };
  activity: {
    active: number;
    inactive: number;
    unknown: number;
    avgTotalActions: number;
  };
  topSegments: Array<{ name: string; count: number }>;
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

  /**
   * Resumo agregado (client-side) sobre uma amostra de usuários exportados —
   * uma aproximação de "painel" derivada do export. NÃO são os KPIs nativos do
   * Dashboard do Personalization (revenue/conversão/impressões não têm API).
   * Limitado por maxRecords; quando truncated=true, há mais dados além da amostra.
   */
  async metricsSummary(options: MetricsSummaryOptions = {}): Promise<MetricsSummary> {
    const activeWithinDays = options.activeWithinDays ?? 30;
    const { users, truncated } = await this.collectUsers(options);

    const now = Date.now();
    const activeWithinMs = activeWithinDays * 86_400_000;

    const scores: number[] = [];
    const distribution: Record<string, number> = { '0': 0, '1-25': 0, '26-50': 0, '51-75': 0, '76-100': 0 };
    const segmentCounts: Record<string, number> = {};
    let actionsSum = 0;
    let actionsCount = 0;
    let active = 0;
    let inactive = 0;
    let unknown = 0;

    for (const u of users) {
      const score = Number(u['engagementScore']);
      if (!Number.isNaN(score)) {
        scores.push(score);
        if (score <= 0) distribution['0']++;
        else if (score <= 25) distribution['1-25']++;
        else if (score <= 50) distribution['26-50']++;
        else if (score <= 75) distribution['51-75']++;
        else distribution['76-100']++;
      }

      const actions = Number(u['totalActions']);
      if (!Number.isNaN(actions)) {
        actionsSum += actions;
        actionsCount++;
      }

      const segs = u['segments'];
      if (Array.isArray(segs)) {
        for (const s of segs) {
          const key = String(s);
          segmentCounts[key] = (segmentCounts[key] ?? 0) + 1;
        }
      }

      const last = Number(u['lastActivity']);
      if (!Number.isNaN(last) && last > 0) {
        if (now - last <= activeWithinMs) active++;
        else inactive++;
      } else {
        unknown++;
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const sum = scores.reduce((a, b) => a + b, 0);

    return {
      sampledUsers: users.length,
      truncated,
      activeWithinDays,
      engagement: {
        withScore: scores.length,
        average: scores.length ? round(sum / scores.length) : 0,
        min: scores.length ? scores.reduce((a, b) => Math.min(a, b)) : null,
        max: scores.length ? scores.reduce((a, b) => Math.max(a, b)) : null,
        distribution,
      },
      activity: {
        active,
        inactive,
        unknown,
        avgTotalActions: actionsCount ? round(actionsSum / actionsCount) : 0,
      },
      topSegments: Object.entries(segmentCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([name, count]) => ({ name, count })),
    };
  }

  /** Pagina o export de usuários acumulando até maxRecords (com teto de segurança). */
  private async collectUsers(
    options: MetricsSummaryOptions,
  ): Promise<{ users: Array<Record<string, unknown>>; truncated: boolean }> {
    const pageSize = Math.min(options.pageSize ?? 200, 1000);
    const maxRecords = Math.min(options.maxRecords ?? 1000, 50_000);
    const users: Array<Record<string, unknown>> = [];
    let page = 0;
    let truncated = false;

    while (true) {
      if (users.length >= maxRecords) {
        truncated = true;
        break;
      }
      const batch = (await this.exportUsers({
        dataset: options.dataset,
        filter: options.filter,
        segmentId: options.segmentId,
        pageSize,
        page,
      })) as Array<Record<string, unknown>>;
      if (!Array.isArray(batch) || batch.length === 0) break;
      users.push(...batch);
      if (batch.length < pageSize) break;
      page++;
    }

    if (users.length > maxRecords) users.length = maxRecords;
    return { users, truncated };
  }
}
