import { Command } from 'commander';
import { searchCommand } from './commands/search.js';
import { readCommand } from './commands/read.js';
import { agentInfoCommand } from './commands/agent-info.js';
import { configShowCommand, configCheckCommand, configSetCommand } from './commands/config-cmd.js';
import { ExitCode } from './errors/index.js';

const program = new Command();

program
  .name('wit')
  .description('Web Intelligence Toolkit — unified CLI for Jina, Exa, Firecrawl, and Grok')
  .version('0.1.0');

// wit search
program
  .command('search')
  .description('Smart-routed web search')
  .argument('<query>', 'Search query')
  .option('-n, --num <count>', 'Number of results', '10')
  .option('-p, --provider <name>', 'Force specific provider')
  .option('--news', 'Search news only')
  .option('--academic', 'Search academic papers')
  .option('--social', 'Search X/Twitter')
  .option('--domain <domains>', 'Include only these domains (comma-separated)')
  .option('--exclude <domains>', 'Exclude these domains (comma-separated)')
  .option('--since <period>', 'Results after period (1h, 1d, 1w, 1m, 1y or ISO date)')
  .option('--json', 'Force JSON output')
  .action(async (query, opts) => {
    await searchCommand(query, { ...opts, num: parseInt(opts.num, 10) });
  });

// wit read
program
  .command('read')
  .description('Read URL and convert to markdown')
  .argument('[url]', 'URL to read (or pipe URLs via stdin)')
  .option('--links', 'Include hyperlinks in output')
  .option('--images', 'Include images in output')
  .option('--selector <css>', 'Target specific DOM element')
  .option('--wait <ms>', 'Wait for JS rendering (ms)')
  .option('-p, --provider <name>', 'Force specific provider')
  .option('--json', 'Force JSON output')
  .action(async (url, opts) => {
    await readCommand(url, { ...opts, wait: opts.wait ? parseInt(opts.wait, 10) : undefined });
  });

// wit agent-info
program
  .command('agent-info')
  .description('Machine-readable capability discovery')
  .action(() => {
    agentInfoCommand();
  });

// wit config
const configCmd = program
  .command('config')
  .description('Manage configuration');

configCmd
  .command('show')
  .description('Show current configuration')
  .action(() => configShowCommand());

configCmd
  .command('check')
  .description('Health check — which providers are configured')
  .action(() => configCheckCommand());

configCmd
  .command('set')
  .description('Set a config value')
  .argument('<key>', 'Config key (e.g., keys.jina)')
  .argument('<value>', 'Config value')
  .action((key, value) => configSetCommand(key, value));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  if (!process.stdout.isTTY) {
    process.stdout.write(JSON.stringify({
      version: '1',
      status: 'error',
      command: 'unknown',
      data: null,
      metadata: { elapsed_ms: 0, providers_used: [], providers_failed: [], cached: false },
      error: { code: 'internal', message: err.message, suggestion: '' },
    }) + '\n');
  } else {
    process.stderr.write(`\x1b[31mError:\x1b[0m ${err.message}\n`);
  }
  process.exit(ExitCode.ApiError);
});

program.parse();
