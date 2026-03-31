import { buildProviders, getProvidersFor } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { WitError, ExitCode } from '../errors/index.js';
import { readStdin } from '../utils/stdin.js';
import type { ReadResult, ReadOpts } from '../types/index.js';

interface ReadFlags {
  links?: boolean;
  images?: boolean;
  selector?: string;
  wait?: number;
  provider?: string;
  json?: boolean;
}

export async function readCommand(url: string | undefined, flags: ReadFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);

  // Get URL from arg or stdin
  let urls: string[] = [];
  if (url) {
    urls = [url];
  } else {
    urls = await readStdin();
  }

  if (urls.length === 0) {
    const resp = buildErrorResponse('read', {
      code: 'missing_input',
      message: 'No URL provided',
      suggestion: 'Usage: wit read <url> or echo "url" | wit read',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ConfigError);
  }

  const providers = buildProviders();

  // Fallback chain: jina -> firecrawl -> exa
  const fallbackOrder = flags.provider
    ? [flags.provider]
    : ['jina', 'firecrawl', 'exa'];

  const available = fallbackOrder
    .map(name => providers.find(p => p.name === name && p.isConfigured() && p.capabilities.read))
    .filter(Boolean) as typeof providers;

  if (available.length === 0) {
    const resp = buildErrorResponse('read', {
      code: 'no_providers',
      message: 'No configured providers for read',
      suggestion: 'Set JINA_API_KEY, FIRECRAWL_API_KEY, or EXA_API_KEY',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ConfigError);
  }

  const opts: ReadOpts = {
    links: flags.links,
    images: flags.images,
    selector: flags.selector,
    wait: flags.wait,
  };

  // Process each URL (batch support)
  for (const targetUrl of urls) {
    let result: ReadResult | null = null;
    const providersUsed: string[] = [];
    const providersFailed: string[] = [];

    // Sequential fallback
    for (const provider of available) {
      try {
        result = await provider.read!(targetUrl, opts);
        providersUsed.push(provider.name);
        break;
      } catch {
        providersFailed.push(provider.name);
      }
    }

    const resp = buildResponse('read', result, {
      query: targetUrl,
      startTime,
      providersUsed,
      providersFailed,
    });

    output(resp, format);
  }

  process.exit(ExitCode.Success);
}
