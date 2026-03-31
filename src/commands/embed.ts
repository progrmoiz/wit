import { buildProviders } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { ExitCode } from '../errors/index.js';
import { readStdin } from '../utils/stdin.js';
import type { EmbedOpts } from '../types/index.js';

interface EmbedFlags {
  model?: string;
  task?: string;
  dimensions?: string;
  local?: boolean;
  json?: boolean;
}

export async function embedCommand(texts: string[], flags: EmbedFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);

  // Read texts from args or stdin
  let input = texts;
  if (input.length === 0) {
    input = await readStdin();
  }

  if (input.length === 0) {
    const resp = buildErrorResponse('embed', {
      code: 'missing_input',
      message: 'No input provided',
      suggestion: 'Usage: wit embed "text" or echo "text" | wit embed',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ConfigError);
    return;
  }

  const providers = buildProviders();
  const jina = providers.find(p => p.name === 'jina' && (p.isConfigured() || flags.local) && p.embed);

  if (!jina) {
    const resp = buildErrorResponse('embed', {
      code: 'no_providers',
      message: 'Jina provider not configured',
      suggestion: 'Set JINA_API_KEY or use --local. Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ConfigError);
    return;
  }

  try {
    const opts: EmbedOpts = {
      model: flags.model,
      task: flags.task,
      dimensions: flags.dimensions ? parseInt(flags.dimensions, 10) : undefined,
      local: flags.local,
    };

    const result = await jina.embed!(input, opts);

    const resp = buildResponse('embed', result, {
      query: input[0],
      startTime,
      providersUsed: [jina.name],
      providersFailed: [],
    });

    output(resp, format);
    process.exit(ExitCode.Success);
  } catch (err) {
    const resp = buildErrorResponse('embed', {
      code: 'api_error',
      message: (err as Error).message,
      suggestion: 'Check your Jina API key',
      provider: 'jina',
    }, startTime);
    output(resp, format);
    process.exit(ExitCode.ApiError);
  }
}
