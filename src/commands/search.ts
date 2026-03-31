import { buildProviders, getProvidersFor } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { WitError, ExitCode } from '../errors/index.js';
import { dedup } from '../utils/url.js';
import { classifyIntent, routeSearch } from '../router/index.js';
import { getCached, setCached } from '../cache/index.js';
import type { SearchResult, SearchOpts } from '../types/index.js';

interface SearchFlags {
  num?: number;
  provider?: string;
  news?: boolean;
  academic?: boolean;
  social?: boolean;
  domain?: string;
  exclude?: string;
  since?: string;
  json?: boolean;
  noCache?: boolean;
  cache?: boolean;  // Commander sets cache:false for --no-cache
}

export async function searchCommand(query: string, flags: SearchFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);
  const providers = buildProviders();

  // Determine task from explicit flags
  const explicitTask = flags.social ? 'searchSocial'
    : flags.academic ? 'searchAcademic'
    : flags.news ? 'searchNews'
    : null;

  const task = explicitTask ?? 'search';

  const opts: SearchOpts = {
    num: flags.num ?? 10,
    since: flags.since,
  };
  if (flags.domain) opts.domains = flags.domain.split(',');
  if (flags.exclude) opts.excludeDomains = flags.exclude.split(',');

  // Check cache first
  if (!flags.noCache && flags.cache !== false) {
    const cacheOpts: Record<string, unknown> = { task, num: opts.num, since: opts.since, domains: opts.domains, excludeDomains: opts.excludeDomains };
    if (flags.provider) cacheOpts.provider = flags.provider;
    const cached = getCached<SearchResult[]>('search', query, cacheOpts);
    if (cached) {
      cached.metadata.cached = true;
      output(cached, format);
      return;
    }
  }

  // Determine available providers
  let available = flags.provider
    ? providers.filter(p => p.name === flags.provider && p.isConfigured())
    : [];

  if (available.length === 0 && flags.provider) {
    const resp = buildErrorResponse('search', {
      code: 'no_providers',
      message: `Provider '${flags.provider}' not found or not configured`,
      suggestion: 'Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exitCode = ExitCode.ConfigError;
    return;
  }

  if (available.length === 0) {
    if (explicitTask) {
      // Use all providers capable of the explicit task
      available = getProvidersFor(task as keyof typeof providers[0]['capabilities'], providers);
    } else {
      // Use smart router for intent classification
      const intent = classifyIntent(query);
      const orderedNames = routeSearch(intent);
      available = orderedNames
        .map(name => providers.find(p => p.name === name && p.isConfigured() && p.capabilities.search))
        .filter(Boolean) as typeof providers;

      // Fallback: if router gives no results, use any configured search provider
      if (available.length === 0) {
        available = getProvidersFor('search', providers);
      }
    }
  }

  if (available.length === 0) {
    const resp = buildErrorResponse('search', {
      code: 'no_providers',
      message: `No configured providers for ${task}`,
      suggestion: 'Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exitCode = ExitCode.ConfigError;
    return;
  }

  const results: SearchResult[] = [];
  const providersUsed: string[] = [];
  const providersFailed: string[] = [];

  // Fan out to all available providers in parallel
  const promises = available.map(async (p) => {
    try {
      let r: SearchResult[];
      if (task === 'searchAcademic' && p.searchAcademic) {
        r = await p.searchAcademic(query, opts);
      } else if (task === 'searchNews' && p.searchNews) {
        r = await p.searchNews(query, opts);
      } else if (task === 'searchSocial' && p.searchSocial) {
        r = await p.searchSocial(query, opts);
      } else if (p.search) {
        r = await p.search(query, opts);
      } else {
        return [];
      }
      providersUsed.push(p.name);
      return r;
    } catch {
      providersFailed.push(p.name);
      return [];
    }
  });

  const allResults = await Promise.all(promises);
  for (const r of allResults) results.push(...r);

  // Dedup and truncate
  const unique = dedup(results) as SearchResult[];
  const final = unique.slice(0, opts.num);

  const costMap: Record<string, number> = { exa: 0.005, jina: 0.01, firecrawl: 0.005, grok: 0.01 };
  const costUsd = providersUsed.reduce((sum, p) => sum + (costMap[p] ?? 0.01), 0);

  const resp = buildResponse('search', final, {
    query,
    startTime,
    providersUsed,
    providersFailed,
    resultCount: final.length,
    costUsd,
  });

  // Save to cache
  if (!flags.noCache && flags.cache !== false) {
    const cacheOpts: Record<string, unknown> = { task, num: opts.num, since: opts.since, domains: opts.domains, excludeDomains: opts.excludeDomains };
    if (flags.provider) cacheOpts.provider = flags.provider;
    setCached('search', query, cacheOpts, resp);
  }

  output(resp, format);
  if (resp.status === 'error' || resp.status === 'all_providers_failed') {
    process.exitCode = ExitCode.ApiError;
  }
}
