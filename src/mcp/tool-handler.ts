import { SfmcApiError } from '../sfmc/sfmc-api.error';

type McpContent = { type: 'text'; text: string };
type McpToolResult = { content: McpContent[]; isError?: boolean };

function isMcpResult(v: unknown): v is McpToolResult {
  return typeof v === 'object' && v !== null && 'content' in v;
}

/**
 * Wraps a tool handler function with standardized error handling.
 * - If fn() returns an object with a `content` field, it's used as-is (for text/delete responses).
 * - Otherwise the result is JSON-stringified.
 * - On failure: returns isError: true with a readable message.
 */
export function toolCall<T>(
  fn: (params: T) => Promise<McpToolResult | unknown>,
): (params: T) => Promise<McpToolResult> {
  return async (params: T) => {
    try {
      const result = await fn(params);
      if (isMcpResult(result)) return result;
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: formatError(err) }] };
    }
  };
}

function formatError(err: unknown): string {
  if (err instanceof SfmcApiError) {
    const lines = [`SFMC API Error: ${err.message}`];
    if (err.details) {
      lines.push(`Details: ${JSON.stringify(err.details, null, 2)}`);
    }
    return lines.join('\n');
  }

  if (err instanceof Error) {
    return `Error: ${err.message}`;
  }

  return `Unexpected error: ${JSON.stringify(err)}`;
}
