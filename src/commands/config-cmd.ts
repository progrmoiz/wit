import { loadConfig, resolveKey, isProviderConfigured, setConfigValue, getConfigFile } from '../config/index.js';

const PROVIDERS = ['jina', 'exa', 'firecrawl', 'grok'] as const;

export function configShowCommand(): void {
  const config = loadConfig();
  console.log(`Config file: ${getConfigFile()}\n`);

  console.log('[keys]');
  for (const p of PROVIDERS) {
    const key = resolveKey(p);
    const masked = key ? key.slice(0, 8) + '...' + key.slice(-4) : '(not set)';
    const source = config.keys[p] ? 'config' : key ? 'env' : '';
    console.log(`  ${p.padEnd(12)} ${masked}${source ? `  (from ${source})` : ''}`);
  }

  console.log('\n[defaults]');
  console.log(`  num_results  ${config.defaults.num_results}`);
  console.log(`  timeout      ${config.defaults.timeout}ms`);
  console.log(`  provider     ${config.defaults.provider || '(auto)'}`);

  console.log('\n[cache]');
  console.log(`  enabled      ${config.cache.enabled}`);
  console.log(`  ttl          ${config.cache.ttl}s`);
}

export function configCheckCommand(): void {
  console.log('Provider Health Check\n');

  for (const p of PROVIDERS) {
    const configured = isProviderConfigured(p);
    const icon = configured ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    const status = configured ? 'configured' : 'not configured';
    console.log(`  ${icon} ${p.padEnd(12)} ${status}`);
  }

  const anyConfigured = PROVIDERS.some(p => isProviderConfigured(p));
  if (!anyConfigured) {
    console.log('\n\x1b[33mNo providers configured.\x1b[0m');
    console.log('Set API keys via env vars or: wit config set keys.<provider> <key>');
    console.log('  JINA_API_KEY, EXA_API_KEY, FIRECRAWL_API_KEY, XAI_API_KEY');
  }
}

export function configSetCommand(key: string, value: string): void {
  setConfigValue(key, value);
  console.log(`Set ${key} = ${value.slice(0, 8)}...`);
}
