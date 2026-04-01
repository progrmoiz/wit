import type { Provider, ProviderCapabilities } from './index.js';
import type { SearchResult, ReadResult, ScreenshotResult, SearchOpts, ReadOpts, TaskType, EmbedResult, RerankResult, ClassifyResult, DedupResult, EmbedOpts, RerankOpts, ClassifyOpts, DedupOpts, PdfOpts } from '../types/index.js';
import { request } from '../utils/http.js';
import { cleanSnippet } from '../utils/format.js';

const READER_BASE = 'https://r.jina.ai/';
const SEARCH_BASE = 'https://svip.jina.ai/';
const ML_BASE = 'https://api.jina.ai/v1';
const PDF_BASE = 'https://svip.jina.ai/extract-pdf';
const LOCAL_BASE = 'http://localhost:8089/v1';

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
    description?: string;
    publishedTime?: string;
    links?: Record<string, string>;
    images?: Record<string, string>;
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
      snippet: cleanSnippet(r.description ?? r.content?.slice(0, 200) ?? ''),
      content: r.content ?? undefined,
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
      snippet: cleanSnippet(r.description ?? r.content?.slice(0, 200) ?? ''),
      content: r.content ?? undefined,
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
    if (opts.selector) headers['X-Wait-For-Selector'] = opts.selector;
    if (opts.wait) headers['X-Timeout'] = String(Math.ceil(opts.wait / 1000));

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
      description: res.data?.description,
      content,
      published: res.data?.publishedTime,
      word_count: content.split(/\s+/).length,
      links: res.data?.links ? Object.keys(res.data.links) : undefined,
      images: res.data?.images ? Object.keys(res.data.images) : undefined,
      source: 'jina',
    };
  }

  async embed(input: string[], opts: EmbedOpts = {}): Promise<EmbedResult> {
    const key = this.getKey();
    const base = opts.local ? LOCAL_BASE : ML_BASE;
    const defaultModel = opts.local ? 'jina-embeddings-v5-nano' : 'jina-embeddings-v5-text-small';

    const body: Record<string, unknown> = {
      model: opts.model ?? defaultModel,
      task: opts.task ?? 'text-matching',
      input,
    };
    if (opts.dimensions) body.dimensions = opts.dimensions;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (key && !opts.local) headers.Authorization = `Bearer ${key}`;

    const res = await request<{ data: Array<{ embedding: number[] }>; model: string; usage?: { total_tokens?: number } }>(`${base}/embeddings`, {
      method: 'POST',
      headers,
      body,
      provider: 'jina',
      timeout: 60000,
    });

    return {
      embeddings: (res.data ?? []).map(d => d.embedding),
      model: res.model ?? (opts.model ?? defaultModel),
      source: opts.local ? 'jina_local' : 'jina',
      usage: res.usage?.total_tokens ? { total_tokens: res.usage.total_tokens } : undefined,
    };
  }

  async rerank(query: string, documents: string[], opts: RerankOpts = {}): Promise<RerankResult> {
    const key = this.getKey();
    const base = opts.local ? LOCAL_BASE : ML_BASE;
    const model = opts.local ? 'jina-embeddings-v5-nano' : 'jina-reranker-v3';

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (key && !opts.local) headers.Authorization = `Bearer ${key}`;

    const res = await request<{ results: Array<{ index: number; relevance_score: number; document: { text: string } }> }>(`${base}/rerank`, {
      method: 'POST',
      headers,
      body: {
        model,
        query,
        documents,
        top_n: opts.topN ?? 10,
      },
      provider: 'jina',
      timeout: 30000,
    });

    return {
      results: (res.results ?? []).map(r => ({
        index: r.index,
        score: r.relevance_score,
        text: r.document?.text ?? documents[r.index] ?? '',
      })),
      source: opts.local ? 'jina_local' : 'jina',
    };
  }

  async classify(texts: string[], labels: string[], opts: ClassifyOpts = {}): Promise<ClassifyResult> {
    const key = this.getKey();
    const base = opts.local ? LOCAL_BASE : ML_BASE;
    const model = opts.local ? 'jina-embeddings-v5-nano' : 'jina-embeddings-v5-text-small';

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (key && !opts.local) headers.Authorization = `Bearer ${key}`;

    const res = await request<{ data: Array<{ text: string; prediction: string; score: number }> }>(`${base}/classify`, {
      method: 'POST',
      headers,
      body: {
        model,
        input: texts,
        labels,
      },
      provider: 'jina',
      timeout: 30000,
    });

    return {
      classifications: (res.data ?? []).map((d, i) => ({
        text: texts[i] ?? d.text ?? '',
        label: d.prediction ?? '',
        score: d.score ?? 0,
      })),
      source: opts.local ? 'jina_local' : 'jina',
    };
  }

  async dedup(items: string[], opts: DedupOpts = {}): Promise<DedupResult> {
    const k = opts.k ?? items.length;

    // Get embeddings for all items
    const embedResult = await this.embed(items, { local: opts.local });
    const embeddings = embedResult.embeddings;

    // Greedy facility-location: pick item with max min-distance to selected set
    const selected: number[] = [];
    const minDist = new Array<number>(items.length).fill(Infinity);

    for (let round = 0; round < Math.min(k, items.length); round++) {
      // First round: pick item 0
      if (selected.length === 0) {
        selected.push(0);
        // Update minDist based on item 0
        for (let j = 0; j < items.length; j++) {
          if (j !== 0) {
            minDist[j] = Math.min(minDist[j], cosineDist(embeddings[0], embeddings[j]));
          }
        }
        continue;
      }

      // Find item with max min-distance
      let bestIdx = -1;
      let bestDist = -1;
      for (let j = 0; j < items.length; j++) {
        if (selected.includes(j)) continue;
        if (minDist[j] > bestDist) {
          bestDist = minDist[j];
          bestIdx = j;
        }
      }

      // Stop if marginal gain < threshold
      if (bestDist < 0.01) break;
      if (bestIdx === -1) break;

      selected.push(bestIdx);

      // Update minDist for remaining items
      for (let j = 0; j < items.length; j++) {
        if (selected.includes(j)) continue;
        minDist[j] = Math.min(minDist[j], cosineDist(embeddings[bestIdx], embeddings[j]));
      }
    }

    const unique = selected.sort((a, b) => a - b).map(i => items[i]);
    return {
      unique,
      removed: items.length - unique.length,
      source: opts.local ? 'jina_local' : 'jina',
    };
  }

  async pdf(url: string, opts: PdfOpts = {}): Promise<unknown> {
    const key = this.getKey();

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;

    const body: Record<string, unknown> = {};
    if (url.startsWith('http')) {
      body.url = url;
    } else {
      // Treat as arXiv ID
      body.id = url;
    }
    body.max_edge = opts.maxEdge ?? 1024;
    body.type = opts.type ?? 'figure,table,equation';

    const res = await request<unknown>(PDF_BASE, {
      method: 'POST',
      headers,
      body,
      provider: 'jina',
      timeout: this.timeout('pdf'),
    });

    return res;
  }
}

function cosineDist(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
  return 1 - sim; // distance = 1 - similarity
}

function parseSince(since: string): string {
  const lower = since.toLowerCase();
  // Match any number followed by a unit: e.g. 7d, 2w, 30d, 1h
  // Google tbs only supports qdr:{unit} — extract the unit and map it
  const match = lower.match(/^\d+([hdwmy])$/);
  if (match) {
    return `qdr:${match[1]}`;
  }
  // Exact single-unit shortcuts without a number prefix
  const unitMap: Record<string, string> = { h: 'qdr:h', d: 'qdr:d', w: 'qdr:w', m: 'qdr:m', y: 'qdr:y' };
  if (unitMap[lower]) return unitMap[lower];
  // Fall back to passing through (e.g. ISO date strings)
  return lower;
}
