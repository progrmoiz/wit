import type { SearchResult, ReadResult, ExtractResult, ScreenshotResult, BrandResult, AnswerResult, SearchOpts, ReadOpts, TaskType, EmbedResult, RerankResult, ClassifyResult, DedupResult, EmbedOpts, RerankOpts, ClassifyOpts, DedupOpts, PdfOpts } from '../types/index.js';

export interface ProviderCapabilities {
  search?: boolean;
  searchNews?: boolean;
  searchAcademic?: boolean;
  searchSocial?: boolean;
  read?: boolean;
  extract?: boolean;
  screenshot?: boolean;
  crawl?: boolean;
  map?: boolean;
  similar?: boolean;
  answer?: boolean;
  research?: boolean;
  embed?: boolean;
  rerank?: boolean;
  classify?: boolean;
  dedup?: boolean;
  brand?: boolean;
  pdf?: boolean;
}

export interface Provider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  isConfigured(): boolean;
  timeout(task: TaskType): number;

  search?(query: string, opts: SearchOpts): Promise<SearchResult[]>;
  searchNews?(query: string, opts: SearchOpts): Promise<SearchResult[]>;
  searchAcademic?(query: string, opts: SearchOpts): Promise<SearchResult[]>;
  searchSocial?(query: string, opts: SearchOpts): Promise<SearchResult[]>;
  read?(url: string, opts: ReadOpts): Promise<ReadResult>;
  similar?(url: string, opts: SearchOpts): Promise<SearchResult[]>;
  answer?(query: string): Promise<AnswerResult>;
  extract?(url: string, schema: Record<string, unknown>, prompt?: string): Promise<ExtractResult>;
  screenshot?(url: string): Promise<ScreenshotResult>;
  brand?(url: string): Promise<BrandResult>;
  map?(url: string): Promise<string[]>;
  embed?(input: string[], opts: EmbedOpts): Promise<EmbedResult>;
  rerank?(query: string, documents: string[], opts: RerankOpts): Promise<RerankResult>;
  classify?(texts: string[], labels: string[], opts: ClassifyOpts): Promise<ClassifyResult>;
  dedup?(items: string[], opts: DedupOpts): Promise<DedupResult>;
  pdf?(url: string, opts: PdfOpts): Promise<unknown>;
}

import { JinaProvider } from './jina.js';
import { ExaProvider } from './exa.js';
import { FirecrawlProvider } from './firecrawl.js';
import { GrokProvider } from './grok.js';
import { resolveKey } from '../config/index.js';

let _cachedProviders: Provider[] | null = null;

export function buildProviders(): Provider[] {
  if (_cachedProviders !== null) return _cachedProviders;
  const providers: Provider[] = [];
  providers.push(new JinaProvider(() => resolveKey('jina')));
  providers.push(new ExaProvider(() => resolveKey('exa')));
  providers.push(new FirecrawlProvider(() => resolveKey('firecrawl')));
  providers.push(new GrokProvider(() => resolveKey('grok')));
  _cachedProviders = providers;
  return providers;
}

export function getProvider(name: string, providers: Provider[]): Provider | undefined {
  return providers.find(p => p.name === name);
}

export function getProvidersFor(task: keyof ProviderCapabilities, providers: Provider[]): Provider[] {
  return providers.filter(p => p.capabilities[task] && p.isConfigured());
}
