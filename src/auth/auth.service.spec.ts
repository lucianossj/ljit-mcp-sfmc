import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { AuthService } from './auth.service';

const mock = new MockAdapter(axios);

const ENV = {
  SFMC_CLIENT_ID: 'test-id',
  SFMC_CLIENT_SECRET: 'test-secret',
  SFMC_SUBDOMAIN: 'mc123',
};

function makeTokenResponse(overrides: Partial<{ expires_in: number }> = {}) {
  return {
    access_token: 'tok_abc',
    expires_in: overrides.expires_in ?? 1200,
    rest_instance_url: 'https://mc123.rest.marketingcloudapis.com/',
    soap_instance_url: 'https://mc123.soap.marketingcloudapis.com/',
  };
}

beforeEach(() => {
  mock.reset();
  Object.assign(process.env, ENV);
  delete process.env.SFMC_ACCOUNT_ID;
});

afterEach(() => {
  for (const key of Object.keys(ENV)) delete process.env[key];
});

describe('AuthService.getAccessToken', () => {
  it('fetches token and returns accessToken and restBaseUrl', async () => {
    mock
      .onPost('https://mc123.auth.marketingcloudapis.com/v2/token')
      .reply(200, makeTokenResponse());

    const svc = new AuthService();
    const result = await svc.getAccessToken();

    expect(result.accessToken).toBe('tok_abc');
    expect(result.restBaseUrl).toBe('https://mc123.rest.marketingcloudapis.com');
  });

  it('strips trailing slash from rest_instance_url', async () => {
    mock
      .onPost('https://mc123.auth.marketingcloudapis.com/v2/token')
      .reply(200, makeTokenResponse());

    const svc = new AuthService();
    const { restBaseUrl } = await svc.getAccessToken();
    expect(restBaseUrl.endsWith('/')).toBe(false);
  });

  it('returns cached token without re-fetching when still valid', async () => {
    mock
      .onPost('https://mc123.auth.marketingcloudapis.com/v2/token')
      .reply(200, makeTokenResponse({ expires_in: 1200 }));

    const svc = new AuthService();
    await svc.getAccessToken();
    await svc.getAccessToken();

    expect(mock.history.post.length).toBe(1);
  });

  it('re-fetches token when cache is within 60s of expiry', async () => {
    mock
      .onPost('https://mc123.auth.marketingcloudapis.com/v2/token')
      .reply(200, makeTokenResponse({ expires_in: 30 })); // expires in 30s < 60s buffer

    const svc = new AuthService();
    await svc.getAccessToken();

    mock
      .onPost('https://mc123.auth.marketingcloudapis.com/v2/token')
      .reply(200, makeTokenResponse({ expires_in: 1200 }));

    await svc.getAccessToken();
    expect(mock.history.post.length).toBe(2);
  });

  it('includes account_id in request body when SFMC_ACCOUNT_ID is set', async () => {
    process.env.SFMC_ACCOUNT_ID = 'acct_999';
    mock
      .onPost('https://mc123.auth.marketingcloudapis.com/v2/token')
      .reply(200, makeTokenResponse());

    const svc = new AuthService();
    await svc.getAccessToken();

    const body = JSON.parse(mock.history.post[0].data);
    expect(body.account_id).toBe('acct_999');
  });

  it('does not include account_id when SFMC_ACCOUNT_ID is not set', async () => {
    mock
      .onPost('https://mc123.auth.marketingcloudapis.com/v2/token')
      .reply(200, makeTokenResponse());

    const svc = new AuthService();
    await svc.getAccessToken();

    const body = JSON.parse(mock.history.post[0].data);
    expect(body.account_id).toBeUndefined();
  });

  it('throws when SFMC_CLIENT_ID is missing', async () => {
    delete process.env.SFMC_CLIENT_ID;
    const svc = new AuthService();
    await expect(svc.getAccessToken()).rejects.toThrow('SFMC_CLIENT_ID');
  });

  it('throws when SFMC_SUBDOMAIN is missing', async () => {
    delete process.env.SFMC_SUBDOMAIN;
    const svc = new AuthService();
    await expect(svc.getAccessToken()).rejects.toThrow('SFMC_SUBDOMAIN');
  });
});
