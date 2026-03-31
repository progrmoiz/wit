import { buildProviders } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { ExitCode } from '../errors/index.js';
import type { AnswerResult } from '../types/index.js';

interface AnswerFlags {
  json?: boolean;
}

export async function answerCommand(query: string, flags: AnswerFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);
  const providers = buildProviders();

  // Primary: Exa answer API; fallback: Grok web_search
  const exa = providers.find(p => p.name === 'exa' && p.isConfigured() && p.answer);
  const grok = providers.find(p => p.name === 'grok' && p.isConfigured() && p.search);

  if (!exa && !grok) {
    const resp = buildErrorResponse('answer', {
      code: 'no_providers',
      message: 'No configured providers for answer (requires EXA_API_KEY or XAI_API_KEY)',
      suggestion: 'Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exitCode = ExitCode.ConfigError;
    return;
  }

  let result: AnswerResult | null = null;
  const providersUsed: string[] = [];
  const providersFailed: string[] = [];

  // Try Exa first
  if (exa) {
    try {
      result = await exa.answer!(query);
      providersUsed.push(exa.name);
    } catch {
      providersFailed.push(exa.name);
    }
  }

  // Fallback to Grok search if Exa failed
  if (!result && grok) {
    try {
      const searchResults = await grok.search!(query, { num: 5 });
      result = {
        answer: `Found ${searchResults.length} results for: ${query}`,
        citations: searchResults.map(r => ({ url: r.url, title: r.title })),
        source: 'grok',
      };
      providersUsed.push(grok.name);
    } catch {
      providersFailed.push(grok.name);
    }
  }

  const resp = buildResponse('answer', result, {
    query,
    startTime,
    providersUsed,
    providersFailed,
  });

  output(resp, format);
  if (resp.status === 'error' || resp.status === 'all_providers_failed') {
    process.exitCode = ExitCode.ApiError;
  }
}
