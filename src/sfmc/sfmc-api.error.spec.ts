import { SfmcApiError, parseSfmcError } from './sfmc-api.error';

describe('SfmcApiError', () => {
  it('sets name, statusCode and message', () => {
    const err = new SfmcApiError(404, 'Not Found', { id: 1 });
    expect(err.name).toBe('SfmcApiError');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Not Found');
    expect(err.details).toEqual({ id: 1 });
  });

  it('is an instance of Error', () => {
    expect(new SfmcApiError(500, 'oops')).toBeInstanceOf(Error);
  });
});

describe('parseSfmcError', () => {
  it('includes label for known status codes', () => {
    const err = parseSfmcError(401, { message: 'invalid_client' });
    expect(err.statusCode).toBe(401);
    expect(err.message).toContain('[Unauthorized');
    expect(err.message).toContain('invalid_client');
  });

  it('falls back to HTTP label for unknown status codes', () => {
    const err = parseSfmcError(422, { message: 'unprocessable' });
    expect(err.message).toContain('[HTTP 422]');
    expect(err.message).toContain('unprocessable');
  });

  it('uses "Unknown SFMC error" when body has no message fields', () => {
    const err = parseSfmcError(500, {});
    expect(err.message).toContain('Unknown SFMC error');
  });

  it('includes validationErrors in message when present', () => {
    const err = parseSfmcError(400, { validationErrors: [{ field: 'name' }] });
    expect(err.message).toContain('Validation:');
  });

  it('joins multiple message fields with em-dash separator', () => {
    const err = parseSfmcError(400, { message: 'bad', errorcode: 'ERR_001' });
    expect(err.message).toContain('bad — ERR_001');
  });

  it('stores the raw body in details', () => {
    const body = { message: 'oops', extra: 'data' };
    const err = parseSfmcError(500, body);
    expect(err.details).toEqual(body);
  });
});
