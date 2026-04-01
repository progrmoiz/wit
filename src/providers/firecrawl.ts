import type { Provider, ProviderCapabilities } from './index.js';
import type { SearchResult, ReadResult, ExtractResult, ScreenshotResult, BrandResult, SearchOpts, ReadOpts, TaskType } from '../types/index.js';
import { request } from '../utils/http.js';
import { cleanSnippet } from '../utils/format.js';

const BASE_URL = 'https://api.firecrawl.dev';

interface FirecrawlSearchResponse {
  data: Array<{
    title?: string;
    url?: string;
    description?: string;
    markdown?: string;
  }>;
}

interface FirecrawlScrapeResponse {
  data: {
    markdown?: string;
    metadata?: {
      title?: string;
      description?: string;
      url?: string;
      publishedTime?: string;
    };
    json?: Record<string, unknown>;
    screenshot?: string;
    branding?: Record<string, unknown>;
  };
}

interface FirecrawlMapResponse {
  links: string[];
}

export class FirecrawlProvider implements Provider {
  readonly name = 'firecrawl';
  readonly capabilities: ProviderCapabilities = {
    search: true,
    read: true,
    extract: true,
    screenshot: true,
    brand: true,
    map: true,
    crawl: true,
  };

  constructor(private getKey: () => string) {}

  isConfigured(): boolean {
    return this.getKey().length > 0;
  }

  timeout(task: TaskType): number {
    if (task === 'crawl') return 120000;
    if (task === 'screenshot') return 60000;
    return 30000;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.getKey()}`,
      Accept: 'application/json',
    };
  }

  async search(query: string, opts: SearchOpts = {}): Promise<SearchResult[]> {
    const res = await request<FirecrawlSearchResponse>(`${BASE_URL}/v2/search`, {
      method: 'POST',
      headers: this.headers(),
      body: {
        query,
        limit: opts.num ?? 10,
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true,
        },
      },
      provider: 'firecrawl',
      timeout: this.timeout('search'),
    });

    return (res.data ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: cleanSnippet(r.description ?? r.markdown?.slice(0, 200) ?? ''),
      content: r.markdown ?? undefined,
      source: 'firecrawl',
    }));
  }

  async read(url: string, _opts: ReadOpts = {}): Promise<ReadResult> {
    const res = await request<FirecrawlScrapeResponse>(`${BASE_URL}/v2/scrape`, {
      method: 'POST',
      headers: this.headers(),
      body: {
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      },
      provider: 'firecrawl',
      timeout: this.timeout('read'),
    });

    const content = res.data?.markdown ?? '';
    return {
      url: res.data?.metadata?.url ?? url,
      title: res.data?.metadata?.title ?? '',
      content,
      published: res.data?.metadata?.publishedTime,
      word_count: content.split(/\s+/).length,
      source: 'firecrawl',
    };
  }

  async extract(url: string, schema: Record<string, unknown>, prompt?: string): Promise<ExtractResult> {
    const body: Record<string, unknown> = {
      url,
      formats: ['json'],
      jsonOptions: { schema, ...(prompt ? { prompt } : {}) },
    };

    const res = await request<FirecrawlScrapeResponse>(`${BASE_URL}/v2/scrape`, {
      method: 'POST',
      headers: this.headers(),
      body,
      provider: 'firecrawl',
      timeout: this.timeout('extract'),
    });

    return {
      url,
      data: res.data?.json ?? {},
      source: 'firecrawl',
    };
  }

  async screenshot(url: string): Promise<ScreenshotResult> {
    const res = await request<FirecrawlScrapeResponse>(`${BASE_URL}/v2/scrape`, {
      method: 'POST',
      headers: this.headers(),
      body: {
        url,
        formats: ['screenshot'],
      },
      provider: 'firecrawl',
      timeout: this.timeout('screenshot'),
    });

    return {
      url,
      image_base64: res.data?.screenshot,
      source: 'firecrawl',
    };
  }

  async brand(url: string): Promise<BrandResult> {
    const res = await request<FirecrawlScrapeResponse>(`${BASE_URL}/v2/scrape`, {
      method: 'POST',
      headers: this.headers(),
      body: {
        url,
        formats: ['branding'],
      },
      provider: 'firecrawl',
      timeout: this.timeout('read'),
    });

    return {
      url,
      data: res.data?.branding ?? {},
      source: 'firecrawl',
    };
  }

  async map(url: string): Promise<string[]> {
    const res = await request<FirecrawlMapResponse>(`${BASE_URL}/v2/map`, {
      method: 'POST',
      headers: this.headers(),
      body: {
        url,
        limit: 100,
      },
      provider: 'firecrawl',
      timeout: this.timeout('map'),
    });

    return res.links ?? [];
  }
}
