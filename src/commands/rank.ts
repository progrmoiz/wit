import { buildProviders } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { ExitCode } from '../errors/index.js';
import { readStdin } from '../utils/stdin.js';
import type { RerankOpts } from '../types/index.js';

interface RankFlags {
  num?: string;
  local?: boolean;
  json?: boolean;
}

export async function rankCommand(query: string, flags: RankFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);

  // Read documents from stdin
  const documents = await readStdin();

  if (documents.length === 0) {
    const resp = buildErrorResponse('rank', {
      code: 'missing_input',
      message: 'No documents provided via stdin',
      suggestion: 'Usage: cat docs.txt | wit rank "query"',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ConfigError);
    return;
  }

  const providers = buildProviders();
  const jina = providers.find(p => p.name === 'jina' && (p.isConfigured() || flags.local) && p.rerank);

  if (!jina) {
    const resp = buildErrorResponse('rank', {
      code: 'no_providers',
      message: 'Jina provider not configured',
      suggestion: 'Set JINA_API_KEY or use --local. Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ConfigError);
    return;
  }

  try {
    const opts: RerankOpts = {
      topN: flags.num ? parseInt(flags.num, 10) : undefined,
      local: flags.local,
    };

    const result = await jina.rerank!(query, documents, opts);

    const resp = buildResponse('rank', result, {
      query,
      startTime,
      providersUsed: [jina.name],
      providersFailed: [],
      resultCount: result.results.length,
    });

    output(resp, format);
    process.exit(ExitCode.Success);
  } catch (err) {
    const resp = buildErrorResponse('rank', {
      code: 'api_error',
      message: (err as Error).message,
      suggestion: 'Check your Jina API key',
      provider: 'jina',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ApiError);
  }
}
