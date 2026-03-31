import type { Provider, ProviderCapabilities } from './index.js';
import type { SearchResult, ReadResult, ScreenshotResult, SearchOpts, ReadOpts, TaskType } from '../types/index.js';
import { request } from '../utils/http.js';

const READER_BASE = 'https://r.jina.ai/';
const SEARCH_BASE = 'https://svip.jina.ai/';

interface JinaSearchResponse {
  data: Array<{
    title: string;
    url: string;
    description?: string;
    content?: string;
  }>;
}

interface JinaReadResponse {
  data: {
    title: string;
    url: string;
    content: string;
    publishedTime?: string;
  };
}

export class JinaProvider implements Provider {
  readonly name = 'jina';
  readonly capabilities: ProviderCapabilities = {
    search: true,
    searchNews: true,
    searchAcademic: true,
    read: true,
    screenshot: true,
    pdf: true,
    // ML ops (Phase 3)
    embed: true,
    rerank: true,
    classify: true,
    dedup: true,
  };

  constructor(private getKey: () => string) {}

  isConfigured(): boolean {
    return this.getKey().length > 0;
  }

  timeout(task: TaskType): number {
    if (task === 'screenshot' || task === 'pdf') return 60000;
    return 30000;
  }

  async search(query: string, opts: SearchOpts = {}): Promise<SearchResult[]> {
    const key = this.getKey();
    const body: Record<string, unknown> = {
      q: query,
      num: opts.num ?? 5,
    };
    if (opts.tbs) body.tbs = opts.tbs;
    if (opts.since) body.tbs = parseSince(opts.since);

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (key) headers.Authorization = `Bearer ${key}`;

    const res = await request<JinaSearchResponse>(SEARCH_BASE, {
      method: 'POST',
      headers,
      body,
      provider: 'jina',
      timeout: this.timeout('search'),
    });

    return (res.data ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.description ?? r.content?.slice(0, 300) ?? '',
      source: 'jina',
    }));
  }

  async searchNews(query: string, opts: SearchOpts = {}): Promise<SearchResult[]> {
    return this.search(query, { ...opts, tbs: 'qdr:d' });
  }

  async searchAcademic(query: string, opts: SearchOpts = {}): Promise<SearchResult[]> {
    const key = this.getKey();
    const domain = opts.category === 'ssrn' ? 'ssrn' : 'arxiv';

    const body: Record<string, unknown> = {
      q: query,
      num: opts.num ?? 5,
      domain,
    };

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (key) headers.Authorization = `Bearer ${key}`;

    const res = await request<JinaSearchResponse>(SEARCH_BASE, {
      method: 'POST',
      headers,
      body,
      provider: 'jina',
      timeout: this.timeout('search_academic'),
    });

    return (res.data ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.description ?? r.content?.slice(0, 300) ?? '',
      source: `jina_${domain}`,
    }));
  }

  async screenshot(url: string): Promise<ScreenshotResult> {
    const key = this.getKey();

    const headers: Record<string, string> = {
      'X-Return-Format': 'screenshot',
    };
    if (key) headers.Authorization = `Bearer ${key}`;

    const res = await request<{ data: { image?: string; url?: string } }>(READER_BASE, {
      method: 'POST',
      headers,
      body: { url },
      provider: 'jina',
      timeout: this.timeout('screenshot'),
    });

    return {
      url: res.data?.url ?? url,
      image_base64: res.data?.image,
      source: 'jina',
    };
  }

  async read(url: string, opts: ReadOpts = {}): Promise<ReadResult> {
    const key = this.getKey();

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Md-Link-Style': 'discarded',
    };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (opts.links) headers['X-With-Links-Summary'] = 'all';
    if (opts.images) {
      headers['X-With-Images-Summary'] = 'true';
    } else {
      headers['X-Retain-Images'] = 'none';
    }
    if (opts.selector) headers['X-Target-Selector'] = opts.selector;
    if (opts.wait) headers['X-Wait-For-Selector'] = opts.selector ?? '';

    const res = await request<JinaReadResponse>(READER_BASE, {
      method: 'POST',
      headers,
      body: { url },
      provider: 'jina',
      timeout: this.timeout('read'),
    });

    const content = res.data?.content ?? '';
    return {
      url: res.data?.url ?? url,
      title: res.data?.title ?? '',
      content,
      published: res.data?.publishedTime,
      word_count: content.split(/\s+/).length,
      source: 'jina',
    };
  }
}

function parseSince(since: string): string {
  const map: Record<string, string> = {
    '1h': 'qdr:h', h: 'qdr:h',
    '1d': 'qdr:d', d: 'qdr:d',
    '1w': 'qdr:w', w: 'qdr:w',
    '1m': 'qdr:m', m: 'qdr:m',
    '1y': 'qdr:y', y: 'qdr:y',
  };
  return map[since.toLowerCase()] ?? since;
}
