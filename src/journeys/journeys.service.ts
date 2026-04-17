import { Injectable } from '@nestjs/common';
import { SfmcHttpService } from '../sfmc/sfmc-http.service';

type JsonRecord = Record<string, unknown>;

export interface JourneyListOptions {
    page?: number;
    pageSize?: number;
    extras?: string;
    nameOrDescription?: string;
    status?: string;
    mostRecentVersionOnly?: boolean;
    fetchAll?: boolean;
}

export interface JourneyLookupOptions {
    versionNumber?: number;
    extras?: string;
}

export interface ResolvedJourneyDe {
    source: 'journey-trigger' | 'event-definition' | 'not-found';
    de_external_key: string;
    de_id: string;
    event_definition_reference_type?: 'key' | 'id';
    event_definition_reference?: string;
    event_definition_key?: string;
}

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null;
}

@Injectable()
export class JourneysService {
    constructor(private readonly http: SfmcHttpService) { }

    async listJourneys(options: JourneyListOptions = {}): Promise<unknown> {
        const safePage = this.coerceInt(options.page, 1) ?? 1;
        const safePageSize = Math.max(1, Math.min(this.coerceInt(options.pageSize, 25) ?? 25, 2500));

        const baseParams: Record<string, unknown> = {
            $page: safePage,
            $pageSize: safePageSize,
            extras: options.extras ?? 'stats',
            mostRecentVersionOnly: String(options.mostRecentVersionOnly ?? true),
        };

        if (options.nameOrDescription) {
            baseParams.nameOrDescription = options.nameOrDescription;
        }
        if (options.status) {
            baseParams.status = options.status;
        }

        if (!options.fetchAll) {
            return this.http.get('/interaction/v1/interactions', baseParams);
        }

        let currentPage = safePage;
        let fetchedPages = 0;
        let firstPayload: JsonRecord | null = null;
        const allItems: JsonRecord[] = [];

        while (fetchedPages < 200) {
            const payload = await this.http.get<JsonRecord>('/interaction/v1/interactions', {
                ...baseParams,
                $page: currentPage,
            });

            if (!firstPayload) {
                firstPayload = payload;
            }

            const pageItems = this.extractItems(payload);
            allItems.push(...pageItems);
            fetchedPages += 1;

            const hasMore = this.hasMoreData(payload, pageItems.length, safePageSize);
            if (!hasMore) {
                break;
            }

            currentPage += 1;
        }

        return {
            ...(firstPayload ?? {}),
            count: allItems.length,
            page: safePage,
            pageSize: safePageSize,
            fetchedPages,
            items: allItems,
        };
    }

    async getJourneyById(journeyId: string, options: JourneyLookupOptions = {}): Promise<unknown> {
        const params: Record<string, unknown> = {
            extras: options.extras ?? 'all',
        };

        if (options.versionNumber !== undefined) {
            params.versionNumber = options.versionNumber;
        }

        return this.http.get(`/interaction/v1/interactions/${encodeURIComponent(journeyId)}`, params);
    }

    async getEventDefinitionByKey(eventDefinitionKey: string): Promise<unknown> {
        const safeKey = encodeURIComponent(eventDefinitionKey);
        return this.http.get(`/interaction/v1/eventDefinitions/key:${safeKey}`);
    }

    async getEventDefinitionById(eventDefinitionId: string): Promise<unknown> {
        const safeId = encodeURIComponent(eventDefinitionId);
        return this.http.get(`/interaction/v1/eventDefinitions/${safeId}`);
    }

    async resolveJourneyDataExtension(
        journeyId: string,
        options: JourneyLookupOptions = {},
    ): Promise<ResolvedJourneyDe> {
        const journey = await this.getJourneyById(journeyId, options);
        if (!isRecord(journey)) {
            return {
                source: 'not-found',
                de_external_key: '',
                de_id: '',
            };
        }

        const triggers = Array.isArray(journey.triggers) ? journey.triggers : [];
        const eventDefinitionRefs: Array<{ type: 'key' | 'id'; value: string }> = [];

        for (const trigger of triggers) {
            if (!isRecord(trigger)) continue;

            const directKey = this.pickFirstValue(trigger, [
                'dataExtensionKey',
                'deExternalKey',
                'dataExtensionExternalKey',
                'metaData.dataExtensionKey',
            ]);
            const directId = this.pickFirstValue(trigger, [
                'dataExtensionId',
                'metaData.dataExtensionId',
                'arguments.dataExtensionId',
            ]);

            if (directKey) {
                return {
                    source: 'journey-trigger',
                    de_external_key: directKey,
                    de_id: directId,
                };
            }

            if (directId) {
                return {
                    source: 'journey-trigger',
                    de_external_key: '',
                    de_id: directId,
                };
            }

            const eventDefinitionKey = this.pickFirstValue(trigger, ['metaData.eventDefinitionKey']);
            if (eventDefinitionKey) {
                eventDefinitionRefs.push({ type: 'key', value: eventDefinitionKey });
            }

            const eventDefinitionId = this.pickFirstValue(trigger, ['metaData.eventDefinitionId']);
            if (eventDefinitionId) {
                eventDefinitionRefs.push({ type: 'id', value: eventDefinitionId });
            }
        }

        if (eventDefinitionRefs.length === 0) {
            return {
                source: 'not-found',
                de_external_key: '',
                de_id: '',
            };
        }

        const firstRef = eventDefinitionRefs[0];

        for (const ref of eventDefinitionRefs) {
            const eventDefinition = ref.type === 'key'
                ? await this.getEventDefinitionByKey(ref.value)
                : await this.getEventDefinitionById(ref.value);

            if (!isRecord(eventDefinition)) continue;

            const eventDeKey = this.pickFirstValue(eventDefinition, [
                'dataExtensionKey',
                'dataExtensionExternalKey',
                'dataExtensionCustomerKey',
                'dataExtension.customerKey',
                'eventDataConfig.dataExtensionCustomerKey',
                'arguments.dataExtensionKey',
                'arguments.dataExtensionExternalKey',
                'arguments.dataExtensionCustomerKey',
                'eventDataConfig.dataExtensionKey',
                'eventDataConfig.deCustomerKey',
                'metaData.dataExtensionKey',
            ]);
            const eventDeId = this.pickFirstValue(eventDefinition, [
                'dataExtensionId',
                'schema.id',
                'arguments.dataExtensionId',
            ]);

            if (eventDeKey || eventDeId) {
                return {
                    source: 'event-definition',
                    event_definition_reference_type: ref.type,
                    event_definition_reference: ref.value,
                    event_definition_key: ref.type === 'key' ? ref.value : '',
                    de_external_key: eventDeKey,
                    de_id: eventDeId,
                };
            }
        }

        return {
            source: 'event-definition',
            event_definition_reference_type: firstRef.type,
            event_definition_reference: firstRef.value,
            event_definition_key: firstRef.type === 'key' ? firstRef.value : '',
            de_external_key: '',
            de_id: '',
        };
    }

    private extractItems(payload: JsonRecord): JsonRecord[] {
        const items = payload.items;
        if (!Array.isArray(items)) return [];
        return items.filter(isRecord);
    }

    private hasMoreData(payload: JsonRecord, pageItemCount: number, pageSize: number): boolean {
        if (typeof payload.hasMore === 'boolean') {
            return payload.hasMore;
        }
        return pageItemCount >= pageSize;
    }

    private coerceInt(value: unknown, defaultValue: number): number {
        const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
        return Number.isNaN(parsed) ? defaultValue : parsed;
    }

    private pickFirstValue(obj: JsonRecord, paths: string[], fallback = ''): string {
        for (const path of paths) {
            const value = this.getNestedValue(obj, path);
            if (value !== null && value !== undefined && value !== '') {
                return String(value);
            }
        }
        return fallback;
    }

    private getNestedValue(obj: unknown, path: string): unknown {
        if (!obj || !path) return null;

        let current: unknown = obj;
        for (const part of path.split('.')) {
            if (Array.isArray(current)) {
                const index = parseInt(part, 10);
                if (Number.isNaN(index) || index < 0 || index >= current.length) return null;
                current = current[index];
                continue;
            }

            if (!isRecord(current)) return null;
            current = current[part];

            if (current === undefined || current === null) return null;
        }

        return current;
    }
}