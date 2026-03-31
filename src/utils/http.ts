import { mapHttpStatus, WitError, ExitCode } from '../errors/index.js';

const RETRY_BACKOFF = [1000, 2000, 4000];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

interface RequestOpts {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  provider: string;
}

export async function request<T = unknown>(url: string, opts: RequestOpts): Promise<T> {
  const { method = 'GET', headers = {}, body, timeout = 30000, provider } = opts;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_BACKOFF.length; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'wit-cli/0.1.0',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        if (RETRYABLE_STATUSES.has(response.status) && attempt < RETRY_BACKOFF.length) {
          // Check Retry-After header for 429s
          const retryAfter = response.headers.get('retry-after');
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : RETRY_BACKOFF[attempt];
          await sleep(delay);
          continue;
        }
        throw mapHttpStatus(response.status, provider);
      }

      return await response.json() as T;
    } catch (err) {
      if (err instanceof WitError) throw err;

      lastError = err as Error;

      if ((err as Error).name === 'AbortError') {
        throw new WitError(
          `Request to ${provider} timed out after ${timeout}ms`,
          ExitCode.ApiError,
          provider,
          'Try again or increase timeout',
        );
      }

      // Retry on network errors
      if (attempt < RETRY_BACKOFF.length) {
        await sleep(RETRY_BACKOFF[attempt]);
        continue;
      }
    }
  }

  throw new WitError(
    `Network error with ${provider}: ${lastError?.message ?? 'unknown'}`,
    ExitCode.ApiError,
    provider,
    'Check your internet connection',
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
