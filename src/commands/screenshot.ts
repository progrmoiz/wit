import { buildProviders } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { ExitCode } from '../errors/index.js';
import { writeFileSync } from 'node:fs';
import type { ScreenshotResult } from '../types/index.js';

interface ScreenshotFlags {
  fullPage?: boolean;
  outputFile?: string;
  json?: boolean;
}

export async function screenshotCommand(url: string, flags: ScreenshotFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);
  const providers = buildProviders();

  // Fallback chain: jina -> firecrawl
  const fallbackOrder = ['jina', 'firecrawl'];
  const available = fallbackOrder
    .map(name => providers.find(p => p.name === name && p.isConfigured() && p.screenshot))
    .filter(Boolean) as typeof providers;

  if (available.length === 0) {
    const resp = buildErrorResponse('screenshot', {
      code: 'no_providers',
      message: 'No configured providers for screenshot',
      suggestion: 'Set JINA_API_KEY or FIRECRAWL_API_KEY. Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ConfigError);
    return;
  }

  let result: ScreenshotResult | null = null;
  const providersUsed: string[] = [];
  const providersFailed: string[] = [];

  // Sequential fallback
  for (const provider of available) {
    try {
      result = await provider.screenshot!(url);
      providersUsed.push(provider.name);
      break;
    } catch {
      providersFailed.push(provider.name);
    }
  }

  // Write to file if requested
  if (result?.image_base64 && flags.outputFile) {
    try {
      const buf = Buffer.from(result.image_base64, 'base64');
      writeFileSync(flags.outputFile, buf);
    } catch {
      // Non-fatal; image still in response
    }
  }

  const resp = buildResponse('screenshot', result, {
    query: url,
    startTime,
    providersUsed,
    providersFailed,
  });

  output(resp, format);
  process.exit(resp.status === 'error' || resp.status === 'all_providers_failed' ? ExitCode.ApiError : ExitCode.Success);
}
