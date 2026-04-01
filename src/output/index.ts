import type { WitResponse, SearchResult, ReadResult, EmbedResult, RerankResult, ClassifyResult, DedupResult } from '../types/index.js';
import { logCommand } from '../logging/index.js';

export type OutputFormat = 'json' | 'table';

// Module-level quiet flag — set by index.ts before dispatching commands
let _quiet = false;
export function setQuiet(q: boolean): void { _quiet = q; }

// Module-level verbose flag — set by index.ts before dispatching commands
let _verbose = false;
export function setVerbose(v: boolean): void { _verbose = v; }

// Debug output to stderr — only when --verbose is active
export function debug(msg: string): void {
  if (_verbose) {
    process.stderr.write(`\x1b[2m[debug] ${msg}\x1b[0m\n`);
  }
}

// NO_COLOR support — https://no-color.org/
const _noColor = !!process.env.NO_COLOR;

// Wrap text in an ANSI escape sequence, or return plain text if color is disabled
function c(ansi: string, text: string): string {
  return _noColor ? text : `${ansi}${text}\x1b[0m`;
}

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
    process.stderr.write(`${c('\x1b[31m', 'Error:')} ${response.error.message}\n`);
    if (response.error.suggestion) {
      process.stderr.write(`${c('\x1b[2m', response.error.suggestion)}\n`);
    }
    return;
  }

  const data = response.data;

  // Search results
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const r = data[i] as SearchResult;
      process.stdout.write(`\n ${c('\x1b[1m', String(i + 1))}  ${c('\x1b[1;37m', r.title)}\n`);
      process.stdout.write(`    ${c('\x1b[4;34m', r.url)}\n`);
      if (r.snippet) {
        process.stdout.write(`    ${c('\x1b[2m', r.snippet)}\n`);
      }
      // Meta line: source · date · score · author
      const metaParts: string[] = [r.source];
      if (r.published) metaParts.push(r.published);
      if (r.score !== undefined) metaParts.push(`score: ${r.score.toFixed(2)}`);
      if (r.author) metaParts.push(`by ${r.author}`);
      const meta = metaParts.join(' · ');
      if (meta) process.stdout.write(`    ${c('\x1b[2;36m', meta)}\n`);
      // Highlights (terminal only, not quiet)
      if (!_quiet && r.highlights && r.highlights.length > 0) {
        process.stdout.write(`\n    ${c('\x1b[2m', 'Highlights:')}\n`);
        for (const h of r.highlights) {
          const line = h.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
          process.stdout.write(`    ${c('\x1b[2m', `• "${line}"`)}\n`);
        }
      }
    }
    process.stdout.write('\n');
    printStatusBar(response);
    return;
  }

  // Read result
  if (data && typeof data === 'object' && 'content' in data) {
    const r = data as unknown as ReadResult;
    process.stdout.write(`${c('\x1b[1;37m', r.title)}\n`);
    process.stdout.write(`${c('\x1b[4;34m', r.url)}\n`);
    const readMeta: string[] = [`${r.word_count} words`, r.source];
    if (r.published) readMeta.push(r.published);
    process.stdout.write(`${c('\x1b[2m', readMeta.join(' · '))}\n\n`);
    process.stdout.write(r.content + '\n');
    return;
  }

  // EmbedResult
  if (data && typeof data === 'object' && 'embeddings' in data) {
    const r = data as unknown as EmbedResult;
    const dims = r.embeddings[0]?.length ?? 0;
    process.stdout.write(`${c('\x1b[1;37m', `${r.embeddings.length} embeddings`)}  ${c('\x1b[2m', `${dims}d · ${r.model} · ${r.source}`)}\n`);
    for (let i = 0; i < Math.min(r.embeddings.length, 3); i++) {
      const preview = r.embeddings[i].slice(0, 4).map(v => v.toFixed(4)).join(', ');
      process.stdout.write(`  ${c('\x1b[2m', `[${preview}...]`)}\n`);
    }
    if (r.embeddings.length > 3) {
      process.stdout.write(`  ${c('\x1b[2m', `... and ${r.embeddings.length - 3} more`)}\n`);
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
      process.stdout.write(`\n ${c('\x1b[1m', String(i + 1))}  ${c('\x1b[2;36m', score)}  ${text}\n`);
    }
    process.stdout.write('\n');
    printStatusBar(response);
    return;
  }

  // ClassifyResult
  if (data && typeof data === 'object' && 'classifications' in data) {
    const r = data as unknown as ClassifyResult;
    for (const cls of r.classifications) {
      const text = cls.text.length > 60 ? cls.text.slice(0, 60) + '...' : cls.text;
      process.stdout.write(`  ${c('\x1b[1;37m', text)}  →  ${c('\x1b[32m', cls.label)}  ${c('\x1b[2m', `(${cls.score.toFixed(4)})`)}\n`);
    }
    printStatusBar(response);
    return;
  }

  // DedupResult
  if (data && typeof data === 'object' && 'unique' in data) {
    const r = data as unknown as DedupResult;
    process.stdout.write(`${c('\x1b[1;37m', `${r.unique.length} unique`)}  ${c('\x1b[2m', `(${r.removed} removed · ${r.source})`)}\n\n`);
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
  if (_quiet) return;

  const parts: string[] = [];

  for (const p of response.metadata.providers_used) {
    parts.push(c('\x1b[32m', `${p} ✓`));
  }
  for (const p of response.metadata.providers_failed) {
    parts.push(c('\x1b[31m', `${p} ✗`));
  }

  if (response.metadata.result_count !== undefined) {
    parts.push(`${response.metadata.result_count} results`);
  }
  parts.push(`${response.metadata.elapsed_ms}ms`);
  if (response.metadata.cost_usd !== undefined) {
    parts.push(`$${response.metadata.cost_usd.toFixed(3)}`);
  }
  if (response.metadata.cached) {
    parts.push(c('\x1b[33m', 'cached'));
  }

  process.stderr.write(`${c('\x1b[2m', ` ${parts.join('  |  ')} `)}\n`);
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
    providerErrors?: Record<string, string>;
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

  const exitCode = status === 'all_providers_failed' ? 1 : 0;

  // Fire-and-forget audit log
  logCommand({
    command,
    query: opts.query,
    providers_used: opts.providersUsed,
    providers_failed: opts.providersFailed,
    result_count: opts.resultCount ?? (Array.isArray(data) ? (data as unknown[]).length : undefined),
    elapsed_ms: elapsed,
    cost_usd: opts.costUsd,
    cached: opts.cached ?? false,
    exit_code: exitCode,
  });

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
      ...(opts.providerErrors && Object.keys(opts.providerErrors).length > 0
        ? { provider_errors: opts.providerErrors }
        : {}),
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
