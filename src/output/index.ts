import type { WitResponse, SearchResult, ReadResult, EmbedResult, RerankResult, ClassifyResult, DedupResult } from '../types/index.js';

export type OutputFormat = 'json' | 'table';

export function detectFormat(jsonFlag?: boolean): OutputFormat {
  if (jsonFlag) return 'json';
  if (!process.stdout.isTTY) return 'json';
  return 'table';
}

export function output<T>(response: WitResponse<T>, format: OutputFormat): void {
  if (format === 'json') {
    const indent = process.stdout.isTTY ? 2 : 0;
    process.stdout.write(JSON.stringify(response, null, indent) + '\n');
    return;
  }
  // Table format
  printTable(response);
}

function printTable<T>(response: WitResponse<T>): void {
  if (response.status === 'error' && response.error) {
    process.stderr.write(`\x1b[31mError:\x1b[0m ${response.error.message}\n`);
    if (response.error.suggestion) {
      process.stderr.write(`\x1b[2m${response.error.suggestion}\x1b[0m\n`);
    }
    return;
  }

  const data = response.data;

  // Search results
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const r = data[i] as SearchResult;
      process.stdout.write(`\n \x1b[1m${i + 1}\x1b[0m  \x1b[1;37m${r.title}\x1b[0m\n`);
      process.stdout.write(`    \x1b[4;34m${r.url}\x1b[0m\n`);
      if (r.snippet) {
        const snip = r.snippet.length > 200 ? r.snippet.slice(0, 200) + '...' : r.snippet;
        process.stdout.write(`    \x1b[2m${snip}\x1b[0m\n`);
      }
      const meta = [r.source, r.published].filter(Boolean).join(' · ');
      if (meta) process.stdout.write(`    \x1b[2;36m${meta}\x1b[0m\n`);
    }
    process.stdout.write('\n');
    printStatusBar(response);
    return;
  }

  // Read result
  if (data && typeof data === 'object' && 'content' in data) {
    const r = data as unknown as ReadResult;
    process.stdout.write(`\x1b[1;37m${r.title}\x1b[0m\n`);
    process.stdout.write(`\x1b[4;34m${r.url}\x1b[0m\n`);
    process.stdout.write(`\x1b[2m${r.word_count} words · ${r.source}\x1b[0m\n\n`);
    process.stdout.write(r.content + '\n');
    return;
  }

  // EmbedResult
  if (data && typeof data === 'object' && 'embeddings' in data) {
    const r = data as unknown as EmbedResult;
    const dims = r.embeddings[0]?.length ?? 0;
    process.stdout.write(`\x1b[1;37m${r.embeddings.length} embeddings\x1b[0m  \x1b[2m${dims}d · ${r.model} · ${r.source}\x1b[0m\n`);
    for (let i = 0; i < Math.min(r.embeddings.length, 3); i++) {
      const preview = r.embeddings[i].slice(0, 4).map(v => v.toFixed(4)).join(', ');
      process.stdout.write(`  \x1b[2m[${preview}...]\x1b[0m\n`);
    }
    if (r.embeddings.length > 3) {
      process.stdout.write(`  \x1b[2m... and ${r.embeddings.length - 3} more\x1b[0m\n`);
    }
    printStatusBar(response);
    return;
  }

  // RerankResult
  if (data && typeof data === 'object' && 'results' in data && !Array.isArray(data)) {
    const r = data as unknown as RerankResult;
    for (let i = 0; i < r.results.length; i++) {
      const item = r.results[i];
      const score = item.score.toFixed(4);
      const text = item.text.length > 120 ? item.text.slice(0, 120) + '...' : item.text;
      process.stdout.write(`\n \x1b[1m${i + 1}\x1b[0m  \x1b[2;36m${score}\x1b[0m  ${text}\n`);
    }
    process.stdout.write('\n');
    printStatusBar(response);
    return;
  }

  // ClassifyResult
  if (data && typeof data === 'object' && 'classifications' in data) {
    const r = data as unknown as ClassifyResult;
    for (const c of r.classifications) {
      const text = c.text.length > 60 ? c.text.slice(0, 60) + '...' : c.text;
      process.stdout.write(`  \x1b[1;37m${text}\x1b[0m  →  \x1b[32m${c.label}\x1b[0m  \x1b[2m(${c.score.toFixed(4)})\x1b[0m\n`);
    }
    printStatusBar(response);
    return;
  }

  // DedupResult
  if (data && typeof data === 'object' && 'unique' in data) {
    const r = data as unknown as DedupResult;
    process.stdout.write(`\x1b[1;37m${r.unique.length} unique\x1b[0m  \x1b[2m(${r.removed} removed · ${r.source})\x1b[0m\n\n`);
    for (const item of r.unique) {
      process.stdout.write(`  ${item}\n`);
    }
    printStatusBar(response);
    return;
  }

  // Fallback: pretty-print JSON
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  printStatusBar(response);
}

function printStatusBar<T>(response: WitResponse<T>): void {
  const parts: string[] = [];

  for (const p of response.metadata.providers_used) {
    parts.push(`\x1b[32m${p} ✓\x1b[0m`);
  }
  for (const p of response.metadata.providers_failed) {
    parts.push(`\x1b[31m${p} ✗\x1b[0m`);
  }

  if (response.metadata.result_count !== undefined) {
    parts.push(`${response.metadata.result_count} results`);
  }
  parts.push(`${response.metadata.elapsed_ms}ms`);
  if (response.metadata.cost_usd !== undefined) {
    parts.push(`$${response.metadata.cost_usd.toFixed(3)}`);
  }
  if (response.metadata.cached) {
    parts.push('\x1b[33mcached\x1b[0m');
  }

  process.stderr.write(`\x1b[2m ${parts.join('  |  ')} \x1b[0m\n`);
}

export function buildResponse<T>(
  command: string,
  data: T | null,
  opts: {
    query?: string;
    startTime: number;
    providersUsed: string[];
    providersFailed: string[];
    costUsd?: number;
    cached?: boolean;
    resultCount?: number;
  }
): WitResponse<T> {
  const elapsed = Date.now() - opts.startTime;
  const status = data === null
    ? 'all_providers_failed'
    : opts.providersFailed.length > 0
      ? 'partial_success'
      : Array.isArray(data) && (data as unknown[]).length === 0
        ? 'no_results'
        : 'success';

  return {
    version: '1',
    status: status as WitResponse['status'],
    command,
    query: opts.query,
    data,
    metadata: {
      elapsed_ms: elapsed,
      providers_used: opts.providersUsed,
      providers_failed: opts.providersFailed,
      cost_usd: opts.costUsd,
      cached: opts.cached ?? false,
      result_count: opts.resultCount ?? (Array.isArray(data) ? (data as unknown[]).length : undefined),
    },
  };
}

export function buildErrorResponse(command: string, error: { code: string; message: string; suggestion: string; provider?: string }, startTime: number): WitResponse<null> {
  return {
    version: '1',
    status: 'error',
    command,
    data: null,
    metadata: {
      elapsed_ms: Date.now() - startTime,
      providers_used: [],
      providers_failed: error.provider ? [error.provider] : [],
      cached: false,
    },
    error,
  };
}
