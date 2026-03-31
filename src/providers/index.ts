import type { SearchResult, ReadResult, SearchOpts, ReadOpts, TaskType } from '../types/index.js';

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
  read?(url: string, opts: ReadOpts): Promise<ReadResult>;
}

import { JinaProvider } from './jina.js';
import { resolveKey } from '../config/index.js';

export function buildProviders(): Provider[] {
  const providers: Provider[] = [];
  providers.push(new JinaProvider(() => resolveKey('jina')));
  // Future: ExaProvider, FirecrawlProvider, GrokProvider
  return providers;
}

export function getProvider(name: string, providers: Provider[]): Provider | undefined {
  return providers.find(p => p.name === name);
}

export function getProvidersFor(task: keyof ProviderCapabilities, providers: Provider[]): Provider[] {
  return providers.filter(p => p.capabilities[task] && p.isConfigured());
}
