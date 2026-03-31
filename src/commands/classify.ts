import { buildProviders } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { ExitCode } from '../errors/index.js';
import { readStdin } from '../utils/stdin.js';
import type { ClassifyOpts } from '../types/index.js';

interface ClassifyFlags {
  labels?: string;
  local?: boolean;
  json?: boolean;
}

export async function classifyCommand(texts: string[], flags: ClassifyFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);

  if (!flags.labels) {
    const resp = buildErrorResponse('classify', {
      code: 'missing_input',
      message: '--labels is required',
      suggestion: 'Usage: wit classify "text" --labels "positive,negative,neutral"',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ConfigError);
    return;
  }

  const labels = flags.labels.split(',').map(l => l.trim()).filter(Boolean);

  // Read texts from args or stdin
  let input = texts;
  if (input.length === 0) {
    input = await readStdin();
  }

  if (input.length === 0) {
    const resp = buildErrorResponse('classify', {
      code: 'missing_input',
      message: 'No texts provided',
      suggestion: 'Usage: wit classify "text" --labels "a,b,c" or echo "text" | wit classify --labels "a,b,c"',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ConfigError);
    return;
  }

  const providers = buildProviders();
  const jina = providers.find(p => p.name === 'jina' && (p.isConfigured() || flags.local) && p.classify);

  if (!jina) {
    const resp = buildErrorResponse('classify', {
      code: 'no_providers',
      message: 'Jina provider not configured',
      suggestion: 'Set JINA_API_KEY or use --local. Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ConfigError);
    return;
  }

  try {
    const opts: ClassifyOpts = { local: flags.local };
    const result = await jina.classify!(input, labels, opts);

    const resp = buildResponse('classify', result, {
      query: input[0],
      startTime,
      providersUsed: [jina.name],
      providersFailed: [],
      resultCount: result.classifications.length,
    });

    output(resp, format);
    process.exit(ExitCode.Success);
  } catch (err) {
    const resp = buildErrorResponse('classify', {
      code: 'api_error',
      message: (err as Error).message,
      suggestion: 'Check your Jina API key',
      provider: 'jina',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ApiError);
  }
}
