import { PersonalizationService } from './personalization.service';
import type { PersAuthService } from './pers-auth.service';
import type { PersHttpService } from './pers-http.service';

const http = { get: jest.fn() } as unknown as PersHttpService;
const auth = { defaultDataset: 'ds1' } as unknown as PersAuthService;
const httpGet = http.get as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('PersonalizationService.metricsSummary', () => {
  let svc: PersonalizationService;
  const NOW = 1_700_000_000_000;
  const DAY = 86_400_000;

  beforeEach(() => {
    svc = new PersonalizationService(auth, http);
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });
  afterEach(() => (Date.now as jest.Mock).mockRestore?.());

  it('aggregates engagement, activity and segments over a single page', async () => {
    httpGet.mockResolvedValueOnce([
      { engagementScore: 10, totalActions: 4, lastActivity: NOW - 1 * DAY, segments: ['A', 'B'] },
      { engagementScore: 90, totalActions: 6, lastActivity: NOW - 40 * DAY, segments: ['A'] },
      { engagementScore: 0, totalActions: 0, lastActivity: 0, segments: [] },
    ]);

    const m = await svc.metricsSummary({ activeWithinDays: 30 });

    expect(m.sampledUsers).toBe(3);
    expect(m.truncated).toBe(false);
    expect(m.engagement.withScore).toBe(3);
    expect(m.engagement.average).toBe(33.33);
    expect(m.engagement.min).toBe(0);
    expect(m.engagement.max).toBe(90);
    expect(m.engagement.distribution).toMatchObject({ '0': 1, '1-25': 1, '76-100': 1 });
    expect(m.activity).toMatchObject({ active: 1, inactive: 1, unknown: 1, avgTotalActions: 3.33 });
    expect(m.topSegments).toEqual([
      { name: 'A', count: 2 },
      { name: 'B', count: 1 },
    ]);
  });

  it('stops at maxRecords and flags truncated when full pages keep coming', async () => {
    const fullPage = Array.from({ length: 200 }, () => ({ engagementScore: 5, segments: [] }));
    httpGet.mockResolvedValue(fullPage); // every page is full -> never short-circuits

    const m = await svc.metricsSummary({ maxRecords: 300, pageSize: 200 });

    expect(m.truncated).toBe(true);
    expect(m.sampledUsers).toBe(300); // capped
  });

  it('does not flag truncated when a short page ends pagination', async () => {
    httpGet.mockResolvedValueOnce(Array.from({ length: 10 }, () => ({ engagementScore: 5, segments: [] })));

    const m = await svc.metricsSummary({ maxRecords: 1000, pageSize: 200 });

    expect(m.truncated).toBe(false);
    expect(m.sampledUsers).toBe(10);
  });
});
