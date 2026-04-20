import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { JourneysService } from './journeys.service';
import { toolCall } from '../mcp/tool-handler';

@Injectable()
export class JourneysToolsService {
    constructor(private readonly journeysService: JourneysService) { }

    register(server: McpServer): void {
        server.tool(
            'jrn_list',
            'Lista jornadas do Journey Builder. Permite filtrar por nome/descrição, status e escolher se deve buscar todas as páginas automaticamente.',
            {
                page: z.number().optional().default(1).describe('Número da página (padrão: 1)'),
                pageSize: z.number().optional().default(25).describe('Itens por página (padrão: 25)'),
                extras: z.string().optional().default('stats').describe('Extras retornados pela API (ex: stats, all)'),
                nameOrDescription: z.string().optional().describe('Filtra por nome ou descrição da jornada'),
                status: z.string().optional().describe('Filtra por status da jornada'),
                mostRecentVersionOnly: z.boolean().optional().default(true).describe('Quando true, retorna apenas a versão mais recente da jornada'),
                fetchAll: z.boolean().optional().default(false).describe('Quando true, busca todas as páginas automaticamente e consolida os itens'),
            },
            toolCall(({ page, pageSize, extras, nameOrDescription, status, mostRecentVersionOnly, fetchAll }) =>
                this.journeysService.listJourneys({
                    page,
                    pageSize,
                    extras,
                    nameOrDescription,
                    status,
                    mostRecentVersionOnly,
                    fetchAll,
                }),
            ),
        );

        server.tool(
            'jrn_get',
            'Obtém os detalhes de uma jornada pelo ID. Opcionalmente permite informar versão específica.',
            {
                journeyId: z.string().describe('ID da jornada'),
                versionNumber: z.number().optional().describe('Número da versão da jornada'),
                extras: z.string().optional().default('all').describe('Extras retornados pela API (ex: all, stats)'),
            },
            toolCall(({ journeyId, versionNumber, extras }) =>
                this.journeysService.getJourneyById(journeyId, { versionNumber, extras }),
            ),
        );

        server.tool(
            'jrn_get_event_definition_by_key',
            'Obtém uma Event Definition do Journey Builder pela chave.',
            {
                eventDefinitionKey: z.string().describe('Chave da Event Definition'),
            },
            toolCall(({ eventDefinitionKey }) =>
                this.journeysService.getEventDefinitionByKey(eventDefinitionKey),
            ),
        );

        server.tool(
            'jrn_get_event_definition_by_id',
            'Obtém uma Event Definition do Journey Builder pelo ID.',
            {
                eventDefinitionId: z.string().describe('ID da Event Definition'),
            },
            toolCall(({ eventDefinitionId }) =>
                this.journeysService.getEventDefinitionById(eventDefinitionId),
            ),
        );

        server.tool(
            'jrn_resolve_entry_de',
            'Resolve a Data Extension de entrada de uma jornada. Tenta identificar pela trigger da jornada e, se necessário, consulta a Event Definition.',
            {
                journeyId: z.string().describe('ID da jornada'),
                versionNumber: z.number().optional().describe('Número da versão da jornada'),
                extras: z.string().optional().default('all').describe('Extras retornados pela API da jornada'),
            },
            toolCall(({ journeyId, versionNumber, extras }) =>
                this.journeysService.resolveJourneyDataExtension(journeyId, {
                    versionNumber,
                    extras,
                }),
            ),
        );
    }
}
