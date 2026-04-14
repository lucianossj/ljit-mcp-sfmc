export class SfmcApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'SfmcApiError';
  }
}

export function parseSfmcError(statusCode: number, body: unknown): SfmcApiError {
  const b = body as Record<string, unknown> | null;

  const message = [
    b?.message,
    b?.errorcode,
    b?.validationErrors && `Validation: ${JSON.stringify(b.validationErrors)}`,
  ]
    .filter(Boolean)
    .join(' — ') || 'Unknown SFMC error';

  const label = HTTP_LABELS[statusCode] ?? `HTTP ${statusCode}`;
  return new SfmcApiError(statusCode, `[${label}] ${message}`, body);
}

const HTTP_LABELS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized — check CLIENT_ID/CLIENT_SECRET/SUBDOMAIN',
  403: 'Forbidden — insufficient permissions for this operation',
  404: 'Not Found',
  429: 'Rate Limited — too many requests',
  500: 'SFMC Internal Server Error',
  503: 'SFMC Unavailable',
};
