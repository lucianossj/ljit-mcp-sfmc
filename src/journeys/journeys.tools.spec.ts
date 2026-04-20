import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { JourneysToolsService } from './journeys.tools';
import type { JourneysService } from './journeys.service';

type RegisteredTool = {
    name: string;
    description: string;
    schema: Record<string, { parse: (value: unknown) => unknown }>;
    handler: (params: Record<string, unknown>) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>;
};

const journeysService = {
    listJourneys: jest.fn(),
    getJourneyById: jest.fn(),
    getEventDefinitionByKey: jest.fn(),
    getEventDefinitionById: jest.fn(),
    resolveJourneyDataExtension: jest.fn(),
} as unknown as JourneysService;

describe('JourneysToolsService', () => {
    let service: JourneysToolsService;
    let registeredTools: RegisteredTool[];
    let server: McpServer;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new JourneysToolsService(journeysService);
        registeredTools = [];
        server = {
            tool: jest.fn((name, description, schema, handler) => {
                registeredTools.push({ name, description, schema, handler });
            }),
        } as unknown as McpServer;
    });

    it('registers all journeys tools', () => {
        service.register(server);

        expect((server.tool as jest.Mock)).toHaveBeenCalledTimes(5);
        expect(registeredTools.map((tool) => tool.name)).toEqual([
            'jrn_list',
            'jrn_get',
            'jrn_get_event_definition_by_key',
            'jrn_get_event_definition_by_id',
            'jrn_resolve_entry_de',
        ]);
    });

    it('registers jrn_list with defaults and delegates to listJourneys', async () => {
        (journeysService.listJourneys as jest.Mock).mockResolvedValue({ items: [{ id: 'j1' }] });

        service.register(server);
        const tool = registeredTools.find((entry) => entry.name === 'jrn_list');

        expect(tool).toBeDefined();
        expect(tool?.schema.page.parse(undefined)).toBe(1);
        expect(tool?.schema.pageSize.parse(undefined)).toBe(25);
        expect(tool?.schema.fetchAll.parse(undefined)).toBe(false);

        const result = await tool!.handler({
            page: 2,
            pageSize: 10,
            extras: 'all',
            nameOrDescription: 'Welcome',
            status: 'Running',
            mostRecentVersionOnly: false,
            fetchAll: true,
        });

        expect(journeysService.listJourneys).toHaveBeenCalledWith({
            page: 2,
            pageSize: 10,
            extras: 'all',
            nameOrDescription: 'Welcome',
            status: 'Running',
            mostRecentVersionOnly: false,
            fetchAll: true,
        });
        expect(result.content[0].text).toBe(JSON.stringify({ items: [{ id: 'j1' }] }, null, 2));
    });

    it('registers jrn_get and delegates to getJourneyById', async () => {
        (journeysService.getJourneyById as jest.Mock).mockResolvedValue({ id: 'journey-1' });

        service.register(server);
        const tool = registeredTools.find((entry) => entry.name === 'jrn_get');

        expect(tool).toBeDefined();
        expect(tool?.schema.extras.parse(undefined)).toBe('all');

        await tool!.handler({
            journeyId: 'journey-1',
            versionNumber: 3,
            extras: 'stats',
        });

        expect(journeysService.getJourneyById).toHaveBeenCalledWith('journey-1', {
            versionNumber: 3,
            extras: 'stats',
        });
    });

    it('registers jrn_get_event_definition_by_key and delegates to getEventDefinitionByKey', async () => {
        (journeysService.getEventDefinitionByKey as jest.Mock).mockResolvedValue({ key: 'evt-key' });

        service.register(server);
        const tool = registeredTools.find((entry) => entry.name === 'jrn_get_event_definition_by_key');

        expect(tool).toBeDefined();

        await tool!.handler({ eventDefinitionKey: 'evt-key' });

        expect(journeysService.getEventDefinitionByKey).toHaveBeenCalledWith('evt-key');
    });

    it('registers jrn_get_event_definition_by_id and delegates to getEventDefinitionById', async () => {
        (journeysService.getEventDefinitionById as jest.Mock).mockResolvedValue({ id: 'evt-id' });

        service.register(server);
        const tool = registeredTools.find((entry) => entry.name === 'jrn_get_event_definition_by_id');

        expect(tool).toBeDefined();

        await tool!.handler({ eventDefinitionId: 'evt-id' });

        expect(journeysService.getEventDefinitionById).toHaveBeenCalledWith('evt-id');
    });

    it('registers jrn_resolve_entry_de and delegates to resolveJourneyDataExtension', async () => {
        (journeysService.resolveJourneyDataExtension as jest.Mock).mockResolvedValue({
            source: 'event-definition',
            de_external_key: 'ENTRY_DE',
            de_id: '123',
        });

        service.register(server);
        const tool = registeredTools.find((entry) => entry.name === 'jrn_resolve_entry_de');

        expect(tool).toBeDefined();
        expect(tool?.schema.extras.parse(undefined)).toBe('all');

        await tool!.handler({
            journeyId: 'journey-99',
            versionNumber: 5,
            extras: 'all',
        });

        expect(journeysService.resolveJourneyDataExtension).toHaveBeenCalledWith('journey-99', {
            versionNumber: 5,
            extras: 'all',
        });
    });
});
