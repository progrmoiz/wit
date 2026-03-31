import { buildProviders } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { ExitCode } from '../errors/index.js';
import { request } from '../utils/http.js';
import { resolveKey } from '../config/index.js';

const FIRECRAWL_BASE = 'https://api.firecrawl.dev';
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60; // 2 min max

interface CrawlFlags {
  limit?: number;
  depth?: number;
  json?: boolean;
}

interface CrawlStartResponse {
  id: string;
  success: boolean;
}

interface CrawlStatusResponse {
  status: 'scraping' | 'completed' | 'failed' | 'cancelled';
  completed: number;
  total: number;
  data?: Array<{
    markdown?: string;
    metadata?: {
      title?: string;
      url?: string;
    };
  }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function crawlCommand(url: string, flags: CrawlFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);
  const providers = buildProviders();

  const firecrawl = providers.find(p => p.name === 'firecrawl' && p.isConfigured());
  if (!firecrawl) {
    const resp = buildErrorResponse('crawl', {
      code: 'no_providers',
      message: 'Firecrawl provider not configured',
      suggestion: 'Set FIRECRAWL_API_KEY. Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ConfigError);
    return;
  }

  const key = resolveKey('firecrawl');
  const headers = {
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  };

  const providersUsed: string[] = [];
  const providersFailed: string[] = [];

  try {
    // Start the crawl
    const startRes = await request<CrawlStartResponse>(`${FIRECRAWL_BASE}/v2/crawl`, {
      method: 'POST',
      headers,
      body: {
        url,
        limit: flags.limit ?? 100,
        maxDepth: flags.depth ?? 3,
      },
      provider: 'firecrawl',
      timeout: 30000,
    });

    const crawlId = startRes.id;
    if (!crawlId) {
      throw new Error('No crawl ID returned');
    }

    // Poll until done
    let statusRes: CrawlStatusResponse | null = null;
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);

      statusRes = await request<CrawlStatusResponse>(`${FIRECRAWL_BASE}/v2/crawl/${crawlId}`, {
        method: 'GET',
        headers,
        provider: 'firecrawl',
        timeout: 15000,
      });

      if (statusRes.status === 'completed' || statusRes.status === 'failed' || statusRes.status === 'cancelled') {
        break;
      }
    }

    if (!statusRes || statusRes.status !== 'completed') {
      throw new Error(`Crawl ${statusRes?.status ?? 'timed out'}`);
    }

    providersUsed.push('firecrawl');

    const pages = (statusRes.data ?? []).map(d => ({
      url: d.metadata?.url ?? '',
      title: d.metadata?.title ?? '',
      content: d.markdown ?? '',
    }));

    const resp = buildResponse('crawl', pages, {
      query: url,
      startTime,
      providersUsed,
      providersFailed,
      resultCount: pages.length,
    });

    output(resp, format);
    process.exit(resp.status === 'error' || resp.status === 'all_providers_failed' ? ExitCode.ApiError : ExitCode.Success);
  } catch (err) {
    providersFailed.push('firecrawl');
    const resp = buildErrorResponse('crawl', {
      code: 'api_error',
      message: (err as Error).message,
      suggestion: 'Check the URL and your Firecrawl account',
      provider: 'firecrawl',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ApiError);
  }
}
