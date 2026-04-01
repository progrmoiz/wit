import type { Provider, ProviderCapabilities } from './index.js';
import type { SearchResult, ReadResult, AnswerResult, SearchOpts, ReadOpts, TaskType } from '../types/index.js';
import { request } from '../utils/http.js';
import { cleanSnippet, formatDate } from '../utils/format.js';

const BASE_URL = 'https://api.exa.ai';

interface ExaSearchResponse {
  results: Array<{
    title: string;
    url: string;
    publishedDate?: string;
    author?: string;
    score?: number;
    highlights?: string[];
    highlightScores?: number[];
    text?: string;
  }>;
}

interface ExaContentsResponse {
  results: Array<{
    title: string;
    url: string;
    publishedDate?: string;
    text?: string;
    highlights?: string[];
    extras?: {
      links?: string[];
      imageLinks?: string[];
    };
  }>;
}

interface ExaAnswerResponse {
  answer: string;
  citations?: Array<{
    url: string;
    title: string;
  }>;
}

export class ExaProvider implements Provider {
  readonly name = 'exa';
  readonly capabilities: ProviderCapabilities = {
    search: true,
    searchNews: true,
    read: true,
    similar: true,
    answer: true,
  };

  constructor(private getKey: () => string) {}

  isConfigured(): boolean {
    return this.getKey().length > 0;
  }

  timeout(task: TaskType): number {
    if (task === 'answer') return 60000;
    return 30000;
  }

  private headers(): Record<string, string> {
    return {
      'x-api-key': this.getKey(),
      Accept: 'application/json',
    };
  }

  async search(query: string, opts: SearchOpts = {}): Promise<SearchResult[]> {
    const body: Record<string, unknown> = {
      query,
      type: 'auto',
      numResults: opts.num ?? 10,
      contents: {
        highlights: { numSentences: 3 },
        text: { maxCharacters: 5000 },
      },
    };

    if (opts.domains && opts.domains.length > 0) body.includeDomains = opts.domains;
    if (opts.excludeDomains && opts.excludeDomains.length > 0) body.excludeDomains = opts.excludeDomains;
    if (opts.since) body.startPublishedDate = parseSinceToIso(opts.since);
    if (opts.category) body.category = opts.category;

    const res = await request<ExaSearchResponse>(`${BASE_URL}/search`, {
      method: 'POST',
      headers: this.headers(),
      body,
      provider: 'exa',
      timeout: this.timeout('search'),
    });

    return (res.results ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: cleanSnippet(r.highlights?.[0] ?? r.text?.slice(0, 200) ?? ''),
      content: r.text ?? undefined,
      highlights: r.highlights?.length ? r.highlights : undefined,
      source: 'exa',
      published: formatDate(r.publishedDate),
      author: r.author ?? undefined,
      score: r.score,
    }));
  }

  async searchNews(query: string, opts: SearchOpts = {}): Promise<SearchResult[]> {
    return this.search(query, { ...opts, category: 'news' });
  }

  async read(url: string, _opts: ReadOpts = {}): Promise<ReadResult> {
    const res = await request<ExaContentsResponse>(`${BASE_URL}/contents`, {
      method: 'POST',
      headers: this.headers(),
      body: {
        urls: [url],
        text: { maxCharacters: 10000 },
        highlights: { numSentences: 3 },
        livecrawl: 'fallback',
        extras: { links: 10, imageLinks: 5 },
      },
      provider: 'exa',
      timeout: this.timeout('read'),
    });

    const r = res.results?.[0];
    const content = r?.text ?? '';
    return {
      url: r?.url ?? url,
      title: r?.title ?? '',
      content,
      published: r?.publishedDate,
      word_count: content.split(/\s+/).length,
      links: r?.extras?.links,
      images: r?.extras?.imageLinks,
      source: 'exa',
    };
  }

  async similar(url: string, opts: SearchOpts = {}): Promise<SearchResult[]> {
    const res = await request<ExaSearchResponse>(`${BASE_URL}/findSimilar`, {
      method: 'POST',
      headers: this.headers(),
      body: {
        url,
        numResults: opts.num ?? 10,
        excludeSourceDomain: true,
        contents: {
          highlights: { numSentences: 3 },
          text: { maxCharacters: 5000 },
        },
      },
      provider: 'exa',
      timeout: this.timeout('similar'),
    });

    return (res.results ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: cleanSnippet(r.highlights?.[0] ?? r.text?.slice(0, 200) ?? ''),
      content: r.text ?? undefined,
      highlights: r.highlights?.length ? r.highlights : undefined,
      source: 'exa',
      published: formatDate(r.publishedDate),
      author: r.author ?? undefined,
      score: r.score,
    }));
  }

  async answer(query: string): Promise<AnswerResult> {
    const res = await request<ExaAnswerResponse>(`${BASE_URL}/answer`, {
      method: 'POST',
      headers: this.headers(),
      body: {
        query,
        text: true,
        model: 'exa',
      },
      provider: 'exa',
      timeout: this.timeout('answer'),
    });

    return {
      answer: res.answer ?? '',
      citations: (res.citations ?? []).map(c => ({ url: c.url, title: c.title })),
      source: 'exa',
    };
  }
}

function parseSinceToIso(since: string): string {
  // If already an ISO date, return as-is
  if (/^\d{4}-\d{2}-\d{2}/.test(since)) return since;

  const now = new Date();
  const match = since.match(/^(\d+)([hdwmy])$/i);
  if (!match) return since;

  const [, numStr, unit] = match;
  const num = parseInt(numStr, 10);

  switch (unit.toLowerCase()) {
    case 'h': now.setHours(now.getHours() - num); break;
    case 'd': now.setDate(now.getDate() - num); break;
    case 'w': now.setDate(now.getDate() - num * 7); break;
    case 'm': now.setMonth(now.getMonth() - num); break;
    case 'y': now.setFullYear(now.getFullYear() - num); break;
  }

  return now.toISOString().split('T')[0];
}
