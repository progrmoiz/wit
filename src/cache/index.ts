import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { WitResponse } from '../types/index.js';

const CACHE_DIR = join(homedir(), '.cache', 'wit');
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheKey(command: string, query: string, opts: Record<string, unknown>): string {
  const payload = JSON.stringify({ command, query, opts });
  return createHash('sha256').update(payload).digest('hex');
}

function ensureCacheDir(): void {
  mkdirSync(CACHE_DIR, { recursive: true });
}

export function getCached<T>(
  command: string,
  query: string,
  opts: Record<string, unknown>,
  ttlMs = DEFAULT_TTL_MS,
): WitResponse<T> | null {
  try {
    const key = cacheKey(command, query, opts);
    const filePath = join(CACHE_DIR, `${key}.json`);

    if (!existsSync(filePath)) return null;

    const stat = statSync(filePath);
    const age = Date.now() - stat.mtimeMs;
    if (age > ttlMs) return null;

    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as WitResponse<T>;
  } catch {
    return null;
  }
}

export function setCached<T>(
  command: string,
  query: string,
  opts: Record<string, unknown>,
  response: WitResponse<T>,
): void {
  try {
    ensureCacheDir();
    const key = cacheKey(command, query, opts);
    const filePath = join(CACHE_DIR, `${key}.json`);
    writeFileSync(filePath, JSON.stringify(response), 'utf-8');
    // Also save as last.json for --last replay
    writeFileSync(join(CACHE_DIR, 'last.json'), JSON.stringify(response), 'utf-8');
  } catch {
    // Cache write failures are non-fatal
  }
}

export function getLastResponse<T>(): WitResponse<T> | null {
  try {
    const filePath = join(CACHE_DIR, 'last.json');
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as WitResponse<T>;
  } catch {
    return null;
  }
}
