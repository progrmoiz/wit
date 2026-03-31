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
    process.exitCode = ExitCode.ConfigError;
    return;
  }

  const opts: SearchOpts = {
    num: flags.num ?? 10,
    from: flags.from,
    since: flags.since,
    until: flags.until,
  };

  let results: SearchResult[] | null = null;
  const providersUsed: string[] = [];
  const providersFailed: string[] = [];

  try {
    results = await grok.searchSocial!(query, opts);
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
  if (resp.status === 'error' || resp.status === 'all_providers_failed') {
    process.exitCode = ExitCode.ApiError;
  }
}
