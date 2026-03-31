import { Command } from 'commander';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { searchCommand } from './commands/search.js';
import { readCommand } from './commands/read.js';
import { similarCommand } from './commands/similar.js';
import { answerCommand } from './commands/answer.js';
import { xCommand } from './commands/x.js';
import { extractCommand } from './commands/extract.js';
import { screenshotCommand } from './commands/screenshot.js';
import { brandCommand } from './commands/brand.js';
import { crawlCommand } from './commands/crawl.js';
import { agentInfoCommand } from './commands/agent-info.js';
import { configShowCommand, configCheckCommand, configSetCommand } from './commands/config-cmd.js';
import { embedCommand } from './commands/embed.js';
import { rankCommand } from './commands/rank.js';
import { classifyCommand } from './commands/classify.js';
import { dedupCommand } from './commands/dedup.js';
import { pdfCommand } from './commands/pdf.js';
import { companyCommand } from './commands/company.js';
import { researchCommand } from './commands/research.js';
import { downloadCommand } from './commands/download.js';
import { monitorCommand } from './commands/monitor.js';
import { grepCommand } from './commands/grep.js';
import { ExitCode } from './errors/index.js';
import { setQuiet } from './output/index.js';

const LAST_CACHE_FILE = join(homedir(), '.cache', 'wit', 'last.json');

const program = new Command();

program
  .name('wit')
  .description('Web Intelligence Toolkit — unified CLI for Jina, Exa, Firecrawl, and Grok')
  .version('0.1.0')
  .option('--quiet', 'Suppress status bar output')
  .option('--last', 'Output the last cached result and exit');

// Apply global flags before any action runs
program.hook('preAction', () => {
  const opts = program.opts();

  if (opts.quiet) {
    setQuiet(true);
  }

  if (opts.last) {
    if (existsSync(LAST_CACHE_FILE)) {
      try {
        const content = readFileSync(LAST_CACHE_FILE, 'utf-8');
        process.stdout.write(content + '\n');
      } catch {
        process.stderr.write('Error reading last result\n');
        process.exitCode = ExitCode.ApiError;
      }
    } else {
      process.stderr.write('No last result found\n');
      process.exitCode = ExitCode.NoResults;
    }
    process.exit();
  }
});

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
  .option('--no-cache', 'Skip cache')
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

// wit similar
program
  .command('similar')
  .description('Find similar pages (Exa findSimilar)')
  .argument('<url>', 'URL to find similar pages for')
  .option('-n, --num <count>', 'Number of results', '10')
  .option('--json', 'Force JSON output')
  .action(async (url, opts) => {
    await similarCommand(url, { ...opts, num: parseInt(opts.num, 10) });
  });

// wit answer
program
  .command('answer')
  .description('Direct answer with citations (Exa Answer / Grok fallback)')
  .argument('<question>', 'Question to answer')
  .option('--json', 'Force JSON output')
  .action(async (question, opts) => {
    await answerCommand(question, opts);
  });

// wit x
program
  .command('x')
  .description('Search X/Twitter via Grok')
  .argument('<query>', 'Search query')
  .option('-n, --num <count>', 'Number of results', '10')
  .option('--from <handle>', 'Filter by author handle')
  .option('--since <date>', 'Results after date (YYYY-MM-DD or 1d/1w)')
  .option('--until <date>', 'Results before date (YYYY-MM-DD)')
  .option('--json', 'Force JSON output')
  .action(async (query, opts) => {
    await xCommand(query, { ...opts, num: parseInt(opts.num, 10) });
  });

// wit extract
program
  .command('extract')
  .description('Structured data extraction (Firecrawl)')
  .argument('<url>', 'URL to extract data from')
  .option('--schema <json>', 'JSON schema for extraction')
  .option('--prompt <text>', 'Natural language extraction prompt')
  .option('--json', 'Force JSON output')
  .action(async (url, opts) => {
    await extractCommand(url, opts);
  });

// wit screenshot
program
  .command('screenshot')
  .description('Screenshot a URL (Jina → Firecrawl fallback)')
  .argument('<url>', 'URL to screenshot')
  .option('--full-page', 'Capture full page')
  .option('--output <file>', 'Save screenshot to file')
  .option('--json', 'Force JSON output')
  .action(async (url, opts) => {
    await screenshotCommand(url, { ...opts, outputFile: opts.output });
  });

// wit brand
program
  .command('brand')
  .description('Extract brand identity (Firecrawl)')
  .argument('<url>', 'URL to extract brand from')
  .option('--json', 'Force JSON output')
  .action(async (url, opts) => {
    await brandCommand(url, opts);
  });

// wit crawl
program
  .command('crawl')
  .description('Full site crawl (Firecrawl async)')
  .argument('<url>', 'URL to crawl')
  .option('--limit <n>', 'Max pages to crawl', '100')
  .option('--depth <n>', 'Max crawl depth', '3')
  .option('--json', 'Force JSON output')
  .action(async (url, opts) => {
    await crawlCommand(url, {
      ...opts,
      limit: parseInt(opts.limit, 10),
      depth: parseInt(opts.depth, 10),
    });
  });

// wit embed
program
  .command('embed')
  .description('Generate text embeddings (Jina)')
  .argument('[texts...]', 'Texts to embed (or pipe via stdin)')
  .option('--model <name>', 'Model name')
  .option('--task <task>', 'Embedding task (text-matching, retrieval, etc.)')
  .option('--dimensions <n>', 'Output dimensions')
  .option('--local', 'Use local Jina server (localhost:8089)')
  .option('--json', 'Force JSON output')
  .action(async (texts, opts) => {
    await embedCommand(texts, opts);
  });

// wit rank
program
  .command('rank')
  .description('Rerank documents by relevance (Jina)')
  .argument('<query>', 'Query to rank documents against')
  .option('-n, --num <count>', 'Top N results')
  .option('--local', 'Use local Jina server (localhost:8089)')
  .option('--json', 'Force JSON output')
  .action(async (query, opts) => {
    await rankCommand(query, opts);
  });

// wit classify
program
  .command('classify')
  .description('Zero-shot text classification (Jina)')
  .argument('[texts...]', 'Texts to classify (or pipe via stdin)')
  .requiredOption('--labels <labels>', 'Comma-separated labels')
  .option('--local', 'Use local Jina server (localhost:8089)')
  .option('--json', 'Force JSON output')
  .action(async (texts, opts) => {
    await classifyCommand(texts, opts);
  });

// wit dedup
program
  .command('dedup')
  .description('Deduplicate text items from stdin (Jina embeddings)')
  .option('-k <count>', 'Max unique items to keep')
  .option('--local', 'Use local Jina server (localhost:8089)')
  .option('--json', 'Force JSON output')
  .action(async (opts) => {
    await dedupCommand(opts);
  });

// wit pdf
program
  .command('pdf')
  .description('Extract figures/tables/equations from PDF (Jina → Firecrawl fallback)')
  .argument('<url-or-id>', 'PDF URL or arXiv ID')
  .option('--type <types>', 'Extraction types (figure,table,equation)')
  .option('--json', 'Force JSON output')
  .action(async (urlOrId, opts) => {
    await pdfCommand(urlOrId, opts);
  });

// wit company
program
  .command('company')
  .description('Company intelligence profile (Exa)')
  .argument('<url>', 'Company URL or domain')
  .option('--json', 'Force JSON output')
  .action(async (url, opts) => {
    await companyCommand(url, opts);
  });

// wit research
program
  .command('research')
  .description('Deep multi-source research')
  .argument('<topic>', 'Research topic or question')
  .option('--model <tier>', 'Use Exa Research API (fast|standard|pro)')
  .option('--depth <level>', 'Research depth (shallow|standard|deep)')
  .option('--max-sources <n>', 'Max sources to read', '5')
  .option('--json', 'Force JSON output')
  .action(async (topic, opts) => {
    await researchCommand(topic, { ...opts, maxSources: opts.maxSources });
  });

// wit download
program
  .command('download')
  .description('Download entire site as markdown files (Firecrawl)')
  .argument('<url>', 'Site URL to download')
  .option('--output <dir>', 'Output directory (default: current directory)')
  .option('--limit <n>', 'Max pages to download', '50')
  .option('--json', 'Force JSON output')
  .action(async (url, opts) => {
    await downloadCommand(url, opts);
  });

// wit monitor
program
  .command('monitor')
  .description('Track page changes (Firecrawl changeTracking)')
  .argument('<url>', 'URL to monitor')
  .option('--json', 'Force JSON output')
  .action(async (url, opts) => {
    await monitorCommand(url, opts);
  });

// wit grep
program
  .command('grep')
  .description('Semantic code search via jina-grep')
  .argument('<pattern>', 'Search pattern')
  .argument('[path]', 'Path to search in')
  .allowUnknownOption(true)
  .action((pattern, pathArg, opts) => {
    const extra = opts.args ?? [];
    grepCommand(pattern, pathArg, extra);
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
