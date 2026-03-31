import { buildProviders } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { ExitCode } from '../errors/index.js';
import type { SearchResult, SearchOpts } from '../types/index.js';

interface XFlags {
  num?: number;
  from?: string;
  since?: string;
  until?: string;
  json?: boolean;
}

export async function xCommand(query: string, flags: XFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);
  const providers = buildProviders();

  const grok = providers.find(p => p.name === 'grok' && p.isConfigured() && p.searchSocial);
  if (!grok) {
    const resp = buildErrorResponse('x', {
      code: 'no_providers',
      message: 'Grok provider not configured',
      suggestion: 'Set XAI_API_KEY. Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ConfigError);
    return;
  }

  // Build enriched query with filters
  let enrichedQuery = query;
  if (flags.from) enrichedQuery += ` from:${flags.from}`;
  if (flags.since) enrichedQuery += ` since:${flags.since}`;
  if (flags.until) enrichedQuery += ` until:${flags.until}`;

  const opts: SearchOpts = {
    num: flags.num ?? 10,
  };

  let results: SearchResult[] | null = null;
  const providersUsed: string[] = [];
  const providersFailed: string[] = [];

  try {
    results = await grok.searchSocial!(enrichedQuery, opts);
    providersUsed.push(grok.name);
  } catch {
    providersFailed.push(grok.name);
  }

  const resp = buildResponse('x', results, {
    query,
    startTime,
    providersUsed,
    providersFailed,
    resultCount: results?.length,
  });

  output(resp, format);
  process.exit(resp.status === 'error' || resp.status === 'all_providers_failed' ? ExitCode.ApiError : ExitCode.Success);
}
