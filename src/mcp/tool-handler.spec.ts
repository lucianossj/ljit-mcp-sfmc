import { toolCall } from './tool-handler';
import { SfmcApiError } from '../sfmc/sfmc-api.error';

describe('toolCall', () => {
  it('JSON-stringifies a plain object result', async () => {
    const handler = toolCall(async () => ({ foo: 'bar' }));
    const result = await handler({});
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe(JSON.stringify({ foo: 'bar' }, null, 2));
  });

  it('passes through a pre-formed MCP result unchanged', async () => {
    const mcpResult = { content: [{ type: 'text' as const, text: 'done' }] };
    const handler = toolCall(async () => mcpResult);
    const result = await handler({});
    expect(result).toBe(mcpResult);
  });

  it('returns isError:true with message when Error is thrown', async () => {
    const handler = toolCall(async () => {
      throw new Error('something went wrong');
    });
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: something went wrong');
  });

  it('formats SfmcApiError with statusCode and details', async () => {
    const handler = toolCall(async () => {
      throw new SfmcApiError(404, '[Not Found] missing', { id: 99 });
    });
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('SFMC API Error:');
    expect(result.content[0].text).toContain('[Not Found] missing');
    expect(result.content[0].text).toContain('"id": 99');
  });

  it('formats SfmcApiError without details when details is absent', async () => {
    const handler = toolCall(async () => {
      throw new SfmcApiError(403, '[Forbidden] nope');
    });
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain('Details:');
  });

  it('formats non-Error thrown values as JSON', async () => {
    const handler = toolCall(async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw { code: 42 };
    });
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unexpected error:');
    expect(result.content[0].text).toContain('42');
  });
});
