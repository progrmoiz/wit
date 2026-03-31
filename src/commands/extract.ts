import { buildProviders } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { ExitCode } from '../errors/index.js';
import type { ExtractResult } from '../types/index.js';

interface ExtractFlags {
  schema?: string;
  prompt?: string;
  json?: boolean;
}

export async function extractCommand(url: string, flags: ExtractFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);
  const providers = buildProviders();

  const firecrawl = providers.find(p => p.name === 'firecrawl' && p.isConfigured() && p.extract);
  if (!firecrawl) {
    const resp = buildErrorResponse('extract', {
      code: 'no_providers',
      message: 'Firecrawl provider not configured',
      suggestion: 'Set FIRECRAWL_API_KEY. Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ConfigError);
    return;
  }

  // Parse schema JSON if provided
  let schema: Record<string, unknown> = {};
  if (flags.schema) {
    try {
      schema = JSON.parse(flags.schema);
    } catch {
      const resp = buildErrorResponse('extract', {
        code: 'invalid_input',
        message: 'Invalid JSON schema',
        suggestion: 'Provide a valid JSON schema string, e.g. --schema \'{"type":"object","properties":{"title":{"type":"string"}}}\'',
      }, startTime);
      output(resp, format);
      process.exit(ExitCode.ConfigError);
      return;
    }
  }

  let result: ExtractResult | null = null;
  const providersUsed: string[] = [];
  const providersFailed: string[] = [];

  try {
    result = await firecrawl.extract!(url, schema, flags.prompt);
    providersUsed.push(firecrawl.name);
  } catch {
    providersFailed.push(firecrawl.name);
  }

  const resp = buildResponse('extract', result, {
    query: url,
    startTime,
    providersUsed,
    providersFailed,
  });

  output(resp, format);
  process.exit(resp.status === 'error' || resp.status === 'all_providers_failed' ? ExitCode.ApiError : ExitCode.Success);
}
