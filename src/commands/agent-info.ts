import { buildProviders } from '../providers/index.js';

export function agentInfoCommand(): void {
  const providers = buildProviders();

  const info = {
    name: 'wit',
    version: '0.1.0',
    description: 'Web Intelligence Toolkit — unified CLI for Jina, Exa, Firecrawl, and Grok',
    commands: [
      { name: 'search', description: 'Smart-routed web search', flags: ['--num', '--provider', '--news', '--academic', '--social', '--domain', '--exclude', '--since', '--no-cache', '--json'] },
      { name: 'read', description: 'URL to markdown', flags: ['--links', '--images', '--selector', '--wait', '--provider', '--json'] },
      { name: 'similar', description: 'Find similar pages (Exa)', flags: ['--num', '--json'] },
      { name: 'answer', description: 'Direct answer with citations (Exa/Grok)', flags: ['--json'] },
      { name: 'x', description: 'X/Twitter search via Grok', flags: ['--num', '--from', '--since', '--until', '--json'] },
      { name: 'extract', description: 'Structured data extraction (Firecrawl)', flags: ['--schema', '--prompt', '--json'] },
      { name: 'screenshot', description: 'Screenshot a URL (Jina → Firecrawl fallback)', flags: ['--full-page', '--output', '--json'] },
      { name: 'brand', description: 'Extract brand identity (Firecrawl)', flags: ['--json'] },
      { name: 'crawl', description: 'Full site crawl (Firecrawl async)', flags: ['--limit', '--depth', '--json'] },
      { name: 'embed', description: 'Generate text embeddings (Jina)', flags: ['--model', '--task', '--dimensions', '--local', '--json'] },
      { name: 'rank', description: 'Rerank documents by relevance (Jina)', flags: ['-n/--num', '--local', '--json'] },
      { name: 'classify', description: 'Zero-shot text classification (Jina)', flags: ['--labels', '--local', '--json'] },
      { name: 'dedup', description: 'Deduplicate text items from stdin (Jina embeddings)', flags: ['-k', '--local', '--json'] },
      { name: 'pdf', description: 'Extract figures/tables/equations from PDF (Jina → Firecrawl)', flags: ['--type', '--json'] },
      { name: 'company', description: 'Company intelligence profile (Exa)', flags: ['--json'] },
      { name: 'research', description: 'Deep multi-source research (Exa Research API or pipeline)', flags: ['--model', '--depth', '--max-sources', '--json'] },
      { name: 'download', description: 'Download entire site as markdown files (Firecrawl)', flags: ['--output', '--limit', '--json'] },
      { name: 'monitor', description: 'Track page changes (Firecrawl changeTracking)', flags: ['--json'] },
      { name: 'grep', description: 'Semantic code search (delegates to jina-grep)', flags: ['<any jina-grep flags>'] },
      { name: 'agent-info', description: 'Machine-readable capability discovery', flags: [] },
      { name: 'config', description: 'Show/set configuration', flags: ['show', 'set', 'check'] },
    ],
    providers: Object.fromEntries(
      providers.map(p => [
        p.name,
        {
          configured: p.isConfigured(),
          capabilities: Object.entries(p.capabilities)
            .filter(([, v]) => v)
            .map(([k]) => k),
        },
      ])
    ),
    global_flags: ['--json', '--provider', '--no-cache'],
    auto_json_when_piped: true,
    semantic_exit_codes: {
      '0': 'success',
      '1': 'api_error',
      '2': 'config_error',
      '3': 'auth_error',
      '4': 'rate_limited',
      '5': 'no_results',
    },
  };

  process.stdout.write(JSON.stringify(info, null, 2) + '\n');
}
