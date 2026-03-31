import { buildProviders } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { ExitCode } from '../errors/index.js';
import type { SearchResult, SearchOpts } from '../types/index.js';

interface SimilarFlags {
  num?: number;
  json?: boolean;
}

export async function similarCommand(url: string, flags: SimilarFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);
  const providers = buildProviders();

  const exa = providers.find(p => p.name === 'exa' && p.isConfigured() && p.similar);
  if (!exa) {
    const resp = buildErrorResponse('similar', {
      code: 'no_providers',
      message: 'Exa provider not configured',
      suggestion: 'Set EXA_API_KEY. Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exitCode = ExitCode.ConfigError;
    return;
  }

  const opts: SearchOpts = {
    num: flags.num ?? 10,
  };

  let results: SearchResult[] | null = null;
  const providersUsed: string[] = [];
  const providersFailed: string[] = [];

  try {
    results = await exa.similar!(url, opts);
    providersUsed.push(exa.name);
  } catch {
    providersFailed.push(exa.name);
  }

  const resp = buildResponse('similar', results, {
    query: url,
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
