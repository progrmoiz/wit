import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

// Load .env file (simple KEY=VALUE parser, no dependency needed)
function loadDotEnv(): void {
  // Check multiple locations: cwd, then wit project root, then mcp-servers
  const locations = [
    resolve(process.cwd(), '.env'),
    resolve(homedir(), 'Documents/Code/wit/.env'),
    resolve(homedir(), 'Documents/Code/mcp-servers/.env'),
  ];

  for (const envPath of locations) {
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx === -1) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          // Strip quotes
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          // Only set if not already in env (env vars take precedence)
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      } catch {
        // Ignore read errors
      }
    }
  }
}

// Load .env on module init
loadDotEnv();

const ConfigSchema = z.object({
  keys: z.object({
    jina: z.string().default(''),
    exa: z.string().default(''),
    firecrawl: z.string().default(''),
    grok: z.string().default(''),
  }).default({}),
  defaults: z.object({
    num_results: z.number().default(10),
    timeout: z.number().default(30000),
    provider: z.string().default(''),
  }).default({}),
  cache: z.object({
    enabled: z.boolean().default(true),
    ttl: z.number().default(300),
  }).default({}),
  logging: z.object({
    enabled: z.boolean().default(true),
    dir: z.string().default(''),
  }).default({}),
  local: z.object({
    jina_grep_server: z.string().default('http://localhost:8089'),
    prefer_local: z.boolean().default(false),
  }).default({}),
});

export type WitConfig = z.infer<typeof ConfigSchema>;

const CONFIG_DIR = join(homedir(), '.config', 'wit');
const CONFIG_FILE = join(CONFIG_DIR, 'config.toml');
const CACHE_DIR = join(homedir(), '.cache', 'wit');
const LOG_DIR = join(homedir(), '.local', 'share', 'wit', 'logs');

export function getConfigDir() { return CONFIG_DIR; }
export function getCacheDir() { return CACHE_DIR; }
export function getLogDir() { return LOG_DIR; }
export function getConfigFile() { return CONFIG_FILE; }

let cachedConfig: WitConfig | null = null;

export function loadConfig(): WitConfig {
  if (cachedConfig) return cachedConfig;

  let fileConfig: Record<string, unknown> = {};

  if (existsSync(CONFIG_FILE)) {
    try {
      // Dynamic import would be better but we need sync for CLI startup
      const content = readFileSync(CONFIG_FILE, 'utf-8');
      // Simple TOML parsing for flat key-value config
      fileConfig = parseSimpleToml(content);
    } catch {
      // Ignore parse errors, use defaults
    }
  }

  const result = ConfigSchema.parse(fileConfig);
  cachedConfig = result;
  return result;
}

export function resolveKey(provider: 'jina' | 'exa' | 'firecrawl' | 'grok'): string {
  const config = loadConfig();
  const configKey = config.keys[provider];
  if (configKey) return configKey;

  // Fallback to standard env vars
  const envMap: Record<string, string> = {
    jina: 'JINA_API_KEY',
    exa: 'EXA_API_KEY',
    firecrawl: 'FIRECRAWL_API_KEY',
    grok: 'XAI_API_KEY',
  };

  // Also check WIT_ prefixed env vars
  const witEnv = process.env[`WIT_KEYS_${provider.toUpperCase()}`];
  if (witEnv) return witEnv;

  return process.env[envMap[provider]] ?? '';
}

export function isProviderConfigured(provider: 'jina' | 'exa' | 'firecrawl' | 'grok'): boolean {
  return resolveKey(provider).length > 0;
}

export function setConfigValue(key: string, value: string): void {
  mkdirSync(CONFIG_DIR, { recursive: true });

  let content = '';
  if (existsSync(CONFIG_FILE)) {
    content = readFileSync(CONFIG_FILE, 'utf-8');
  }

  // Simple key=value setting for dotted keys like keys.jina
  const parts = key.split('.');
  if (parts.length === 2) {
    const section = `[${parts[0]}]`;
    const prop = parts[1];

    if (content.includes(section)) {
      const regex = new RegExp(`(\\[${parts[0]}\\][\\s\\S]*?)${prop}\\s*=\\s*"[^"]*"`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, `$1${prop} = "${value}"`);
      } else {
        content = content.replace(section, `${section}\n${prop} = "${value}"`);
      }
    } else {
      content += `\n${section}\n${prop} = "${value}"\n`;
    }
  }

  writeFileSync(CONFIG_FILE, content, 'utf-8');
  cachedConfig = null; // Clear cache
}

function parseSimpleToml(content: string): Record<string, unknown> {
  const result: Record<string, Record<string, unknown>> = {};
  let currentSection = '';

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const sectionMatch = trimmed.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      result[currentSection] = result[currentSection] ?? {};
      continue;
    }

    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch && currentSection) {
      const [, k, rawV] = kvMatch;
      let v: string | number | boolean = rawV.trim();
      // Strip quotes
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      } else if (v === 'true') {
        v = true;
      } else if (v === 'false') {
        v = false;
      } else if (!isNaN(Number(v))) {
        v = Number(v);
      }
      result[currentSection][k] = v;
    }
  }

  return result;
}
