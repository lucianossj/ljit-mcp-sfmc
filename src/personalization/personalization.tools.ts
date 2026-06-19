import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PersonalizationService } from './personalization.service';
import { toolCall } from '../mcp/tool-handler';

/**
 * Tools de LEITURA do Marketing Cloud Personalization.
 * Operações de escrita (eventos/recomendações) e GDPR delete não são
 * registradas enquanto a integração aponta para dados de produção.
 */
@Injectable()
export class PersonalizationToolsService {
  constructor(private readonly pers: PersonalizationService) {}

  register(server: McpServer): void {
    server.tool(
      'pers_export_users',
      'Exporta usuários do dataset do Personalization (uma página). Retorna atributos, segmentos, engagement scores e atividade. Paginação manual via page (zero-indexed) + pageSize. Somente leitura.',
      {
        dataset: z.string().optional().describe('Dataset alvo (padrão: MCP_PERS_DATASET)'),
        filter: z.string().optional().describe('Nome ou ID de segmento para filtrar'),
        segmentId: z.string().optional().describe('ID do segmento'),
        segmentationId: z.string().optional().describe('ID da segmentação'),
        start: z.number().optional().describe('Início da janela de engajamento (epoch ms)'),
        end: z.number().optional().describe('Fim da janela de engajamento (epoch ms)'),
        pageSize: z.number().optional().describe('Registros por página'),
        page: z.number().optional().describe('Página (zero-indexed)'),
        includeGeo: z.boolean().optional().describe('Inclui detalhes de geolocalização'),
      },
      toolCall((params) => this.pers.exportUsers(params)),
    );

    server.tool(
      'pers_export_accounts',
      'Exporta contas (account-level) do dataset do Personalization (uma página). Retorna segmentos, engagement scores e atividade. Paginação manual via page (zero-indexed) + pageSize. Somente leitura.',
      {
        dataset: z.string().optional().describe('Dataset alvo (padrão: MCP_PERS_DATASET)'),
        filter: z.string().optional().describe('Nome ou ID de segmento para filtrar'),
        segmentId: z.string().optional().describe('ID do segmento'),
        segmentationId: z.string().optional().describe('ID da segmentação'),
        start: z.number().optional().describe('Início da janela de engajamento (epoch ms)'),
        end: z.number().optional().describe('Fim da janela de engajamento (epoch ms)'),
        pageSize: z.number().optional().describe('Registros por página'),
        page: z.number().optional().describe('Página (zero-indexed)'),
        includeGeo: z.boolean().optional().describe('Inclui detalhes de geolocalização'),
      },
      toolCall((params) => this.pers.exportAccounts(params)),
    );

    server.tool(
      'pers_user_lookup',
      'Busca um usuário do Personalization pelo primary user ID ou anonymous ID. Útil para requisições de acesso (GDPR Right of Access). Somente leitura.',
      {
        userId: z.string().describe('Primary user ID ou anonymous ID'),
        dataset: z.string().optional().describe('Dataset alvo (padrão: MCP_PERS_DATASET)'),
      },
      toolCall(({ userId, dataset }) => this.pers.lookupUser(userId, dataset)),
    );

    server.tool(
      'pers_metrics_summary',
      'Resumo agregado (aproximação de painel) sobre uma amostra de usuários exportados: engagement score (média/min/máx/distribuição), atividade (ativos vs inativos por lastActivity, média de ações) e top segmentos por nº de usuários. ' +
      'É derivado do export, calculado client-side — NÃO são os KPIs nativos do Dashboard (revenue/conversão/impressões não têm API). ' +
      'Limitado por maxRecords; truncated=true indica que há mais dados além da amostra. Use filter/segmentId para focar um segmento. Somente leitura.',
      {
        dataset: z.string().optional().describe('Dataset alvo (padrão: MCP_PERS_DATASET)'),
        filter: z.string().optional().describe('Nome ou ID de segmento para limitar a amostra'),
        segmentId: z.string().optional().describe('ID do segmento'),
        activeWithinDays: z.number().optional().describe('Janela em dias para considerar "ativo" pela lastActivity (padrão: 30)'),
        maxRecords: z.number().optional().describe('Teto de registros agregados (padrão: 1000, máx: 50000)'),
        pageSize: z.number().optional().describe('Tamanho de página do export (padrão: 200, máx: 1000)'),
      },
      toolCall((params) => this.pers.metricsSummary(params)),
    );

    server.tool(
      'pers_audit_log',
      'Lista logs de acesso e atividade do Personalization. Range máximo de 50 dias; pageSize máx 2000. Requer permissão "Can access Audit logs" no token. Somente leitura.',
      {
        page: z.number().optional().describe('Página (padrão: 1)'),
        pageSize: z.number().optional().describe('Registros por página (padrão: 100, máx: 2000)'),
        startDate: z.string().optional().describe('Data inicial ISO-8601 (padrão: 7 dias atrás)'),
        endDate: z.string().optional().describe('Data final ISO-8601 (padrão: hoje, range máx 50 dias)'),
      },
      toolCall((params) => this.pers.auditLog(params)),
    );
  }
}
