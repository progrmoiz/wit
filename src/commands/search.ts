import { buildProviders, getProvidersFor } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { WitError, ExitCode } from '../errors/index.js';
import { dedup } from '../utils/url.js';
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
}

export async function searchCommand(query: string, flags: SearchFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);
  const providers = buildProviders();

  const task = flags.social ? 'searchSocial'
    : flags.academic ? 'searchAcademic'
    : flags.news ? 'searchNews'
    : 'search';

  // Filter to requested provider or get all capable ones
  let available = flags.provider
    ? providers.filter(p => p.name === flags.provider)
    : getProvidersFor(task, providers);

  if (available.length === 0) {
    const resp = buildErrorResponse('search', {
      code: 'no_providers',
      message: `No configured providers for ${task}`,
      suggestion: 'Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ConfigError);
  }

  const opts: SearchOpts = {
    num: flags.num ?? 10,
    since: flags.since,
  };
  if (flags.domain) opts.domains = flags.domain.split(',');
  if (flags.exclude) opts.excludeDomains = flags.exclude.split(',');

  const results: SearchResult[] = [];
  const providersUsed: string[] = [];
  const providersFailed: string[] = [];

  // Fan out to all available providers in parallel
  const promises = available.map(async (p) => {
    try {
      const method = task === 'searchAcademic' ? p.searchAcademic
        : task === 'searchNews' ? p.searchNews
        : p.search;

      if (!method) return [];
      const r = await method.call(p, query, opts);
      providersUsed.push(p.name);
      return r;
    } catch (err) {
      providersFailed.push(p.name);
      return [];
    }
  });

  const allResults = await Promise.all(promises);
  for (const r of allResults) results.push(...r);

  // Dedup and truncate
  const unique = dedup(results) as SearchResult[];
  const final = unique.slice(0, opts.num);

  const resp = buildResponse('search', final, {
    query,
    startTime,
    providersUsed,
    providersFailed,
    resultCount: final.length,
    costUsd: providersUsed.length * 0.01, // rough estimate
  });

  output(resp, format);
  process.exit(resp.status === 'error' || resp.status === 'all_providers_failed' ? ExitCode.ApiError : ExitCode.Success);
}
