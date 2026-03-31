import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOG_DIR = join(homedir(), '.local', 'share', 'wit', 'logs');

export function logCommand(entry: {
  command: string;
  query?: string;
  providers_used: string[];
  providers_failed: string[];
  result_count?: number;
  elapsed_ms: number;
  cost_usd?: number;
  cached: boolean;
  exit_code: number;
}): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const date = new Date().toISOString().split('T')[0];
    const file = join(LOG_DIR, `${date}.jsonl`);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
    appendFileSync(file, line + '\n', 'utf-8');
  } catch {
    // Logging failures are non-fatal
  }
}
