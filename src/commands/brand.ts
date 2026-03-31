import { buildProviders } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { ExitCode } from '../errors/index.js';
import type { BrandResult } from '../types/index.js';

interface BrandFlags {
  json?: boolean;
}

export async function brandCommand(url: string, flags: BrandFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);
  const providers = buildProviders();

  const firecrawl = providers.find(p => p.name === 'firecrawl' && p.isConfigured() && p.brand);
  if (!firecrawl) {
    const resp = buildErrorResponse('brand', {
      code: 'no_providers',
      message: 'Firecrawl provider not configured',
      suggestion: 'Set FIRECRAWL_API_KEY. Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exitCode = ExitCode.ConfigError;
    return;
  }

  let result: BrandResult | null = null;
  const providersUsed: string[] = [];
  const providersFailed: string[] = [];

  try {
    result = await firecrawl.brand!(url);
    providersUsed.push(firecrawl.name);
  } catch {
    providersFailed.push(firecrawl.name);
  }

  const resp = buildResponse('brand', result, {
    query: url,
    startTime,
    providersUsed,
    providersFailed,
  });

  output(resp, format);
  if (resp.status === 'error' || resp.status === 'all_providers_failed') {
    process.exitCode = ExitCode.ApiError;
  }
}
