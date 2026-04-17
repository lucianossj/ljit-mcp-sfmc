import { JourneysService } from './journeys.service';
import type { SfmcHttpService } from '../sfmc/sfmc-http.service';

const http = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
} as unknown as SfmcHttpService;

beforeEach(() => jest.clearAllMocks());

describe('JourneysService', () => {
    let svc: JourneysService;

    beforeEach(() => {
        svc = new JourneysService(http);
    });

    describe('listJourneys', () => {
        it('calls interactions endpoint with default pagination', async () => {
            (http.get as jest.Mock).mockResolvedValue({ count: 0, items: [] });

            await svc.listJourneys();

            expect(http.get).toHaveBeenCalledWith('/interaction/v1/interactions', {
                $page: 1,
                $pageSize: 25,
                extras: 'stats',
                mostRecentVersionOnly: 'true',
            });
        });

        it('passes filters when provided', async () => {
            (http.get as jest.Mock).mockResolvedValue({ count: 0, items: [] });

            await svc.listJourneys({
                page: 2,
                pageSize: 50,
                extras: 'all',
                nameOrDescription: 'Welcome',
                status: 'Running',
                mostRecentVersionOnly: false,
            });

            expect(http.get).toHaveBeenCalledWith('/interaction/v1/interactions', {
                $page: 2,
                $pageSize: 50,
                extras: 'all',
                nameOrDescription: 'Welcome',
                status: 'Running',
                mostRecentVersionOnly: 'false',
            });
        });

        it('aggregates all pages when fetchAll is true', async () => {
            (http.get as jest.Mock)
                .mockResolvedValueOnce({
                    count: 4,
                    page: 1,
                    pageSize: 2,
                    items: [{ id: 'j1' }, { id: 'j2' }],
                    hasMore: true,
                })
                .mockResolvedValueOnce({
                    count: 4,
                    page: 2,
                    pageSize: 2,
                    items: [{ id: 'j3' }, { id: 'j4' }],
                    hasMore: false,
                });

            const result = await svc.listJourneys({ pageSize: 2, fetchAll: true }) as Record<string, unknown>;

            expect(http.get).toHaveBeenNthCalledWith(1, '/interaction/v1/interactions', {
                $page: 1,
                $pageSize: 2,
                extras: 'stats',
                mostRecentVersionOnly: 'true',
            });
            expect(http.get).toHaveBeenNthCalledWith(2, '/interaction/v1/interactions', {
                $page: 2,
                $pageSize: 2,
                extras: 'stats',
                mostRecentVersionOnly: 'true',
            });
            expect(result['count']).toBe(4);
            expect(result['fetchedPages']).toBe(2);
            expect(result['items']).toEqual([{ id: 'j1' }, { id: 'j2' }, { id: 'j3' }, { id: 'j4' }]);
        });
    });

    describe('getJourneyById', () => {
        it('calls journey details endpoint with encoded id and extras', async () => {
            (http.get as jest.Mock).mockResolvedValue({ id: 'journey/id' });

            await svc.getJourneyById('journey/id', { versionNumber: 3, extras: 'all' });

            expect(http.get).toHaveBeenCalledWith('/interaction/v1/interactions/journey%2Fid', {
                extras: 'all',
                versionNumber: 3,
            });
        });
    });

    describe('event definition lookups', () => {
        it('gets event definition by key', async () => {
            (http.get as jest.Mock).mockResolvedValue({ eventDefinitionKey: 'evt key' });

            await svc.getEventDefinitionByKey('evt key');

            expect(http.get).toHaveBeenCalledWith('/interaction/v1/eventDefinitions/key:evt%20key');
        });

        it('gets event definition by id', async () => {
            (http.get as jest.Mock).mockResolvedValue({ id: 'evt/id' });

            await svc.getEventDefinitionById('evt/id');

            expect(http.get).toHaveBeenCalledWith('/interaction/v1/eventDefinitions/evt%2Fid');
        });
    });

    describe('resolveJourneyDataExtension', () => {
        it('returns direct DE data from journey trigger when available', async () => {
            (http.get as jest.Mock).mockResolvedValue({
                triggers: [
                    {
                        dataExtensionKey: 'ENTRY_DE',
                        dataExtensionId: '123',
                    },
                ],
            });

            const result = await svc.resolveJourneyDataExtension('journey-1');

            expect(result).toEqual({
                source: 'journey-trigger',
                de_external_key: 'ENTRY_DE',
                de_id: '123',
            });
        });

        it('falls back to event definition lookup when trigger does not expose DE directly', async () => {
            (http.get as jest.Mock)
                .mockResolvedValueOnce({
                    triggers: [
                        {
                            metaData: {
                                eventDefinitionKey: 'event-key-1',
                            },
                        },
                    ],
                })
                .mockResolvedValueOnce({
                    dataExtensionCustomerKey: 'ENTRY_BY_EVENT',
                    dataExtensionId: '456',
                });

            const result = await svc.resolveJourneyDataExtension('journey-2');

            expect(http.get).toHaveBeenNthCalledWith(2, '/interaction/v1/eventDefinitions/key:event-key-1');
            expect(result).toEqual({
                source: 'event-definition',
                event_definition_reference_type: 'key',
                event_definition_reference: 'event-key-1',
                event_definition_key: 'event-key-1',
                de_external_key: 'ENTRY_BY_EVENT',
                de_id: '456',
            });
        });

        it('returns not-found when neither trigger nor event definition expose a DE', async () => {
            (http.get as jest.Mock).mockResolvedValue({ triggers: [] });

            const result = await svc.resolveJourneyDataExtension('journey-3');

            expect(result).toEqual({
                source: 'not-found',
                de_external_key: '',
                de_id: '',
            });
        });
    });
});