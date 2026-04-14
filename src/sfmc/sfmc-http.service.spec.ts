import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { SfmcHttpService } from './sfmc-http.service';
import { SfmcApiError } from './sfmc-api.error';
import type { AuthService } from '../auth/auth.service';

const mock = new MockAdapter(axios);

const BASE_URL = 'https://mc.rest.marketingcloudapis.com';
const TOKEN = 'bearer_token_123';

const authService = {
  getAccessToken: jest.fn().mockResolvedValue({
    accessToken: TOKEN,
    restBaseUrl: BASE_URL,
  }),
} as unknown as AuthService;

beforeEach(() => {
  mock.reset();
  jest.clearAllMocks();
  (authService.getAccessToken as jest.Mock).mockResolvedValue({
    accessToken: TOKEN,
    restBaseUrl: BASE_URL,
  });
});

describe('SfmcHttpService', () => {
  let svc: SfmcHttpService;
  beforeEach(() => { svc = new SfmcHttpService(authService); });

  it('GET builds correct URL and sets Authorization header', async () => {
    mock.onGet(`${BASE_URL}/some/path`).reply(200, { ok: true });

    const result = await svc.get('/some/path');

    expect(result).toEqual({ ok: true });
    expect(mock.history.get[0].headers?.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('GET passes query params', async () => {
    mock.onGet(`${BASE_URL}/path`).reply(200, []);

    await svc.get('/path', { $page: 2, $pageSize: 10 });

    expect(mock.history.get[0].params).toEqual({ $page: 2, $pageSize: 10 });
  });

  it('POST sends data with correct headers', async () => {
    mock.onPost(`${BASE_URL}/path`).reply(201, { created: true });

    const result = await svc.post('/path', { name: 'test' });

    expect(result).toEqual({ created: true });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ name: 'test' });
  });

  it('PATCH sends data', async () => {
    mock.onPatch(`${BASE_URL}/path/1`).reply(200, { updated: true });
    const result = await svc.patch('/path/1', { field: 'value' });
    expect(result).toEqual({ updated: true });
  });

  it('DELETE calls correct endpoint', async () => {
    mock.onDelete(`${BASE_URL}/path/1`).reply(204, '');
    await svc.delete('/path/1');
    expect(mock.history.delete.length).toBe(1);
  });

  it('throws SfmcApiError on 4xx response', async () => {
    mock.onGet(`${BASE_URL}/bad`).reply(404, { message: 'not found' });

    await expect(svc.get('/bad')).rejects.toThrow(SfmcApiError);
    await expect(svc.get('/bad')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws SfmcApiError on 5xx response after retries', async () => {
    jest.useFakeTimers();
    mock.onPost(`${BASE_URL}/error`).reply(500, { message: 'server error' });

    // Catch immediately to prevent unhandled rejection warning
    const p1 = svc.post<unknown>('/error', {}).catch((e: unknown) => e);
    await jest.runAllTimersAsync();
    const err = await p1;
    expect(err).toBeInstanceOf(SfmcApiError);
    expect((err as SfmcApiError).statusCode).toBe(500);

    jest.useRealTimers();
  }, 15_000);

  it('retries on 5xx and succeeds on recovery', async () => {
    jest.useFakeTimers();
    // Two separate replyOnce calls to queue sequential responses
    mock.onPost(`${BASE_URL}/flaky`).replyOnce(500, {});
    mock.onPost(`${BASE_URL}/flaky`).replyOnce(200, { ok: true });

    const p = svc.post('/flaky', {});
    await jest.runAllTimersAsync();
    await expect(p).resolves.toEqual({ ok: true });

    jest.useRealTimers();
  }, 15_000);

  it('rethrows non-HTTP errors (e.g. network failure)', async () => {
    mock.onGet(`${BASE_URL}/network`).networkError();

    await expect(svc.get('/network')).rejects.toThrow();
    await expect(svc.get('/network')).rejects.not.toBeInstanceOf(SfmcApiError);
  });
});
