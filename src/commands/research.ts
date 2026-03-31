import { buildProviders, getProvidersFor } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { ExitCode } from '../errors/index.js';
import { request } from '../utils/http.js';
import { resolveKey } from '../config/index.js';
import type { SearchResult } from '../types/index.js';

const EXA_BASE = 'https://api.exa.ai';
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 60; // 3 min max

interface ResearchFlags {
  model?: string;
  depth?: string;
  maxSources?: string;
  json?: boolean;
}

interface ExaResearchStartResponse {
  id: string;
  status: string;
}

interface ExaResearchStatusResponse {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  report?: string;
  sources?: Array<{ url: string; title: string }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function researchCommand(topic: string, flags: ResearchFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);

  const providers = buildProviders();
  const providersUsed: string[] = [];
  const providersFailed: string[] = [];

  // Mode 1: Exa Research API (when --model is specified)
  if (flags.model) {
    const exa = providers.find(p => p.name === 'exa' && p.isConfigured());

    if (!exa) {
      const resp = buildErrorResponse('research', {
        code: 'no_providers',
        message: 'Exa provider not configured (required for --model mode)',
        suggestion: 'Set EXA_API_KEY. Run: wit config check',
      }, startTime);
      output(resp, format);
      process.exitCode = ExitCode.ConfigError;
      return;
    }

    const modelMap: Record<string, string> = {
      fast: 'exa-research-fast',
      standard: 'exa-research',
      pro: 'exa-research-pro',
    };

    const exaModel = modelMap[flags.model] ?? 'exa-research';
    const key = resolveKey('exa');
    const headers = { 'x-api-key': key, Accept: 'application/json' };

    try {
      // Start research job
      const startRes = await request<ExaResearchStartResponse>(`${EXA_BASE}/research/v1`, {
        method: 'POST',
        headers,
        body: {
          instructions: topic,
          model: exaModel,
        },
        provider: 'exa',
        timeout: 30000,
      });

      const jobId = startRes.id;
      if (!jobId) throw new Error('No research job ID returned');

      // Poll until completed
      let statusRes: ExaResearchStatusResponse | null = null;
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        await sleep(POLL_INTERVAL_MS);

        statusRes = await request<ExaResearchStatusResponse>(`${EXA_BASE}/research/v1/${jobId}`, {
          method: 'GET',
          headers,
          provider: 'exa',
          timeout: 15000,
        });

        if (statusRes.status === 'completed' || statusRes.status === 'failed') break;
      }

      if (!statusRes || statusRes.status !== 'completed') {
        throw new Error(`Research job ${statusRes?.status ?? 'timed out'}`);
      }

      providersUsed.push('exa');

      const result = {
        topic,
        model: exaModel,
        report: statusRes.report ?? '',
        sources: statusRes.sources ?? [],
      };

      const resp = buildResponse('research', result, {
        query: topic,
        startTime,
        providersUsed,
        providersFailed,
      });

      output(resp, format);
    } catch (err) {
      providersFailed.push('exa');
      const resp = buildErrorResponse('research', {
        code: 'api_error',
        message: (err as Error).message,
        suggestion: 'Check your Exa API key and account status',
        provider: 'exa',
      }, startTime);
      output(resp, format);
      process.exitCode = ExitCode.ApiError;
    }
    return;
  }

  // Mode 2: Multi-step pipeline (default)
  const maxSources = flags.maxSources ? parseInt(flags.maxSources, 10) : 5;

  const searchProviders = getProvidersFor('search', providers);
  if (searchProviders.length === 0) {
    const resp = buildErrorResponse('research', {
      code: 'no_providers',
      message: 'No configured search providers',
      suggestion: 'Set EXA_API_KEY or JINA_API_KEY. Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exitCode = ExitCode.ConfigError;
    return;
  }

  // Step 1: Search via Exa + Jina in parallel
  const searchResults: SearchResult[] = [];
  const searchPromises = searchProviders.map(async (p) => {
    try {
      const r = await p.search!(topic, { num: 5 });
      providersUsed.push(p.name);
      return r;
    } catch {
      providersFailed.push(p.name);
      return [];
    }
  });

  const allSearchResults = await Promise.all(searchPromises);
  for (const r of allSearchResults) searchResults.push(...r);

  // Step 2: Read top N URLs via Jina
  const jina = providers.find(p => p.name === 'jina' && p.isConfigured() && p.read);
  const topUrls = searchResults.slice(0, maxSources).map(r => r.url);

  const readResults = await Promise.allSettled(
    topUrls.map(url => jina?.read!(url, {}) ?? Promise.reject(new Error('no reader')))
  );

  const sources = readResults
    .map((r, i) => ({
      url: topUrls[i],
      title: searchResults[i]?.title ?? '',
      content: r.status === 'fulfilled' ? r.value.content : '',
    }));

  const result = {
    topic,
    search_results: searchResults,
    sources,
  };

  const resp = buildResponse('research', result, {
    query: topic,
    startTime,
    providersUsed,
    providersFailed,
    resultCount: searchResults.length,
  });

  output(resp, format);
  if (resp.status === 'error' || resp.status === 'all_providers_failed') {
    process.exitCode = ExitCode.ApiError;
  }
}
