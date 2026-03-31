import { buildProviders } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { ExitCode } from '../errors/index.js';
import type { PdfOpts } from '../types/index.js';

interface PdfFlags {
  type?: string;
  json?: boolean;
}

export async function pdfCommand(urlOrId: string, flags: PdfFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);

  const providers = buildProviders();
  const jina = providers.find(p => p.name === 'jina' && p.isConfigured() && p.pdf);
  const firecrawl = providers.find(p => p.name === 'firecrawl' && p.isConfigured() && p.read);

  if (!jina && !firecrawl) {
    const resp = buildErrorResponse('pdf', {
      code: 'no_providers',
      message: 'No configured providers for pdf (requires JINA_API_KEY or FIRECRAWL_API_KEY)',
      suggestion: 'Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exitCode = ExitCode.ConfigError;
    return;
  }

  const opts: PdfOpts = { type: flags.type };

  const providersUsed: string[] = [];
  const providersFailed: string[] = [];
  let result: unknown = null;

  // Primary: Jina pdf extraction
  if (jina) {
    try {
      result = await jina.pdf!(urlOrId, opts);
      providersUsed.push(jina.name);
    } catch {
      providersFailed.push(jina.name);
    }
  }

  // Fallback: Firecrawl scrape with PDF URL
  if (!result && firecrawl && urlOrId.startsWith('http')) {
    try {
      result = await firecrawl.read!(urlOrId, {});
      providersUsed.push(firecrawl.name);
    } catch {
      providersFailed.push(firecrawl.name);
    }
  }

  const resp = buildResponse('pdf', result, {
    query: urlOrId,
    startTime,
    providersUsed,
    providersFailed,
  });

  output(resp, format);
  if (resp.status === 'error' || resp.status === 'all_providers_failed') {
    process.exitCode = ExitCode.ApiError;
  }
}
