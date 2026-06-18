export class PersApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PersApiError';
  }
}

export function parsePersError(statusCode: number, body: unknown): PersApiError {
  let message: string;

  if (typeof body === 'string') {
    message = body.trim() || 'Unknown Personalization error';
  } else {
    const b = body as Record<string, unknown> | null;
    message =
      [b?.errorMessage, b?.message, b?.error, b?.detail]
        .filter(Boolean)
        .join(' — ') || 'Unknown Personalization error';
  }

  const label = HTTP_LABELS[statusCode] ?? `HTTP ${statusCode}`;
  return new PersApiError(statusCode, `[${label}] ${message}`, body);
}

const HTTP_LABELS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized — check MCP_PERS_API_KEY_ID/MCP_PERS_API_SECRET',
  403: 'Forbidden — token lacks permission for this operation',
  404: 'Not Found — check dataset/account/instance',
  413: 'Payload Too Large',
  429: 'Rate Limited — too many requests',
  500: 'Personalization Internal Server Error',
  503: 'Personalization Unavailable',
};
