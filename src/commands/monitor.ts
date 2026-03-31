import { buildProviders } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { ExitCode } from '../errors/index.js';
import { request } from '../utils/http.js';
import { resolveKey } from '../config/index.js';

const FIRECRAWL_BASE = 'https://api.firecrawl.dev';

interface MonitorFlags {
  json?: boolean;
}

interface FirecrawlScrapeResponse {
  data?: {
    changeTracking?: Record<string, unknown>;
    metadata?: {
      title?: string;
      url?: string;
    };
  };
}

export async function monitorCommand(url: string, flags: MonitorFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);

  const providers = buildProviders();
  const firecrawl = providers.find(p => p.name === 'firecrawl' && p.isConfigured());

  if (!firecrawl) {
    const resp = buildErrorResponse('monitor', {
      code: 'no_providers',
      message: 'Firecrawl provider not configured',
      suggestion: 'Set FIRECRAWL_API_KEY. Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exitCode = ExitCode.ConfigError;
    return;
  }

  const key = resolveKey('firecrawl');
  const headers = {
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  };

  try {
    const res = await request<FirecrawlScrapeResponse>(`${FIRECRAWL_BASE}/v2/scrape`, {
      method: 'POST',
      headers,
      body: {
        url,
        formats: ['changeTracking'],
      },
      provider: 'firecrawl',
      timeout: 30000,
    });

    const result = {
      url: res.data?.metadata?.url ?? url,
      title: res.data?.metadata?.title ?? '',
      changeTracking: res.data?.changeTracking ?? {},
    };

    const resp = buildResponse('monitor', result, {
      query: url,
      startTime,
      providersUsed: ['firecrawl'],
      providersFailed: [],
    });

    output(resp, format);
  } catch (err) {
    const resp = buildErrorResponse('monitor', {
      code: 'api_error',
      message: (err as Error).message,
      suggestion: 'Check the URL and your Firecrawl account',
      provider: 'firecrawl',
    }, startTime);
    output(resp, format);
    process.exitCode = ExitCode.ApiError;
  }
}
