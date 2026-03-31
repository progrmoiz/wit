import { buildProviders } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { ExitCode } from '../errors/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface DownloadFlags {
  output?: string;
  limit?: string;
  json?: boolean;
}

function sanitizeFilename(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\//g, '_').replace(/^_/, '') || 'index';
    return path.replace(/[^a-z0-9._-]/gi, '_') + '.md';
  } catch {
    return url.replace(/[^a-z0-9._-]/gi, '_') + '.md';
  }
}

export async function downloadCommand(url: string, flags: DownloadFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);

  const providers = buildProviders();
  const firecrawl = providers.find(p => p.name === 'firecrawl' && p.isConfigured() && p.map && p.read);

  if (!firecrawl) {
    const resp = buildErrorResponse('download', {
      code: 'no_providers',
      message: 'Firecrawl provider not configured',
      suggestion: 'Set FIRECRAWL_API_KEY. Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exitCode = ExitCode.ConfigError;
    return;
  }

  const limit = flags.limit ? parseInt(flags.limit, 10) : 50;
  const outputDir = flags.output ?? '.';

  const providersUsed: string[] = [];
  const providersFailed: string[] = [];

  try {
    // Step 1: Map all URLs
    const allUrls = await firecrawl.map!(url);
    const urls = allUrls.slice(0, limit);

    providersUsed.push('firecrawl');

    // Step 2: Batch read each URL
    mkdirSync(outputDir, { recursive: true });

    const results: Array<{ url: string; file: string }> = [];

    const reads = await Promise.allSettled(
      urls.map(u => firecrawl.read!(u, {}))
    );

    for (let i = 0; i < reads.length; i++) {
      const r = reads[i];
      if (r.status === 'fulfilled') {
        const filename = sanitizeFilename(urls[i]);
        const filepath = join(outputDir, filename);
        const content = `# ${r.value.title}\n\nSource: ${urls[i]}\n\n${r.value.content}`;
        writeFileSync(filepath, content, 'utf-8');
        results.push({ url: urls[i], file: filepath });
      }
    }

    const resp = buildResponse('download', { downloaded: results, total: urls.length }, {
      query: url,
      startTime,
      providersUsed,
      providersFailed,
      resultCount: results.length,
    });

    output(resp, format);
  } catch (err) {
    providersFailed.push('firecrawl');
    const resp = buildErrorResponse('download', {
      code: 'api_error',
      message: (err as Error).message,
      suggestion: 'Check the URL and your Firecrawl account',
      provider: 'firecrawl',
    }, startTime);
    output(resp, format);
    process.exitCode = ExitCode.ApiError;
  }
}
