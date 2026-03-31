```
██╗    ██╗██╗████████╗
██║    ██║██║╚══██╔══╝
██║ █╗ ██║██║   ██║
██║███╗██║██║   ██║
╚███╔███╔╝██║   ██║
 ╚══╝╚══╝ ╚═╝   ╚═╝
```

# wit — Web Intelligence Toolkit

Unified CLI for web search, scraping, research, and ML ops. Routes to the best provider per task across **Jina**, **Exa**, **Firecrawl**, and **Grok/xAI**.

- Smart routing — queries auto-route to the best provider based on intent
- Fallback chains — if one provider fails, the next one picks up
- Auto-JSON when piped — human-friendly tables in terminal, JSON when piped
- Agent-ready — `agent-info` command, semantic exit codes, versioned response envelopes
- 4 providers, 21 commands, 24 capabilities

## Quick Start

```bash
# Install
npm install -g wit-cli

# Set API keys (any combination works — more keys = more capabilities)
export JINA_API_KEY=jina_xxx
export EXA_API_KEY=xxx
export FIRECRAWL_API_KEY=fc-xxx
export XAI_API_KEY=xai-xxx

# Or put them in a .env file in the project root

# Verify setup
wit config check

# Search the web
wit search "AI embeddings 2025"

# Read any URL as markdown
wit read https://example.com

# Get a direct answer with citations
wit answer "What is ActiveCalculator?"

# Research a company
wit company https://exa.ai
```

## Commands

### Search & Discovery

| Command | Description | Providers |
|---------|-------------|-----------|
| `wit search <query>` | Smart-routed web search | Exa + Jina + Firecrawl (parallel) |
| `wit x <query>` | Search X/Twitter | Grok (exclusive) |
| `wit similar <url>` | Find similar pages | Exa |
| `wit answer <question>` | Direct answer with citations | Exa → Grok (fallback) |
| `wit company <url>` | Company intelligence (8 parallel searches) | Exa |
| `wit research <topic>` | Deep multi-source research | Exa Research API or multi-step pipeline |

### Read & Extract

| Command | Description | Providers |
|---------|-------------|-----------|
| `wit read <url>` | URL to markdown | Jina → Firecrawl → Exa (fallback) |
| `wit extract <url>` | Structured data extraction with schema | Firecrawl |
| `wit screenshot <url>` | Screenshot a URL | Jina → Firecrawl (fallback) |
| `wit brand <url>` | Extract brand identity (colors, fonts, tone) | Firecrawl |
| `wit pdf <url-or-arxiv-id>` | Extract figures/tables from PDF | Jina → Firecrawl (fallback) |

### Crawl & Monitor

| Command | Description | Providers |
|---------|-------------|-----------|
| `wit crawl <url>` | Full site crawl (async) | Firecrawl |
| `wit download <url>` | Download site as markdown files | Firecrawl |
| `wit monitor <url>` | Track page changes | Firecrawl |

### ML Operations

| Command | Description | Providers |
|---------|-------------|-----------|
| `wit embed [texts...]` | Generate text embeddings | Jina (supports `--local`) |
| `wit rank <query>` | Rerank documents from stdin | Jina (supports `--local`) |
| `wit classify [texts...]` | Zero-shot text classification | Jina (supports `--local`) |
| `wit dedup` | Deduplicate text from stdin | Jina (supports `--local`) |
| `wit grep <pattern> [path]` | Semantic code search | jina-grep (local MLX) |

### System

| Command | Description |
|---------|-------------|
| `wit agent-info` | Machine-readable capability discovery |
| `wit config show` | Show configuration |
| `wit config check` | Provider health check |
| `wit config set <key> <val>` | Set config value |

## Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Force JSON output |
| `--quiet` | Suppress status bar |
| `--verbose` | Show debug info (provider URLs, methods) |
| `--last` | Replay last cached result |

## Output Modes

**Terminal (human):** Colored tables with status bar showing providers, timing, and cost.

```
 1  What Are AI Embeddings? A Plain-English Guide
    https://example.com/ai-embeddings
    Embeddings are representations of values or objects...
    exa · 2025-06-14

 exa ✓  jina ✓  firecrawl ✗  |  5 results  |  1592ms  |  $0.015
```

**Piped (agent):** Auto-detects non-TTY and outputs JSON:

```bash
wit search "AI" | jq '.data[0].url'
# "https://example.com/ai-guide"
```

**JSON envelope:**

```json
{
  "version": "1",
  "status": "success",
  "command": "search",
  "query": "AI embeddings",
  "data": [...],
  "metadata": {
    "elapsed_ms": 1592,
    "providers_used": ["exa", "jina"],
    "providers_failed": [],
    "cost_usd": 0.015,
    "cached": false,
    "result_count": 5
  }
}
```

## Piping & Composability

```bash
# Search → read top result
wit search "AI agents" --json | jq -r '.data[0].url' | wit read

# Search → deduplicate snippets
wit search "ML frameworks" --json | jq -r '.data[].snippet' | wit dedup

# Company competitors → find similar
wit company example.com --json | jq -r '.data.competitors[].url' | xargs -I{} wit similar {}

# Batch read URLs from file
cat urls.txt | wit read

# Classify text from stdin
echo "This product is amazing" | wit classify --labels "positive,negative,neutral"
```

## Smart Routing

When you run `wit search`, the query is classified by intent and routed to the best provider:

| Intent | Triggers | Routes to |
|--------|----------|-----------|
| Social | "tweets", "on twitter", "@handle" | Grok |
| Academic | "paper", "arxiv", "research paper" | Jina |
| News | "latest", "breaking", "news" | Exa + Jina |
| People | "who is", "linkedin", "CEO" | Exa |
| Company | "funding", "revenue", "startup" | Exa |
| General | Everything else | Exa + Jina + Firecrawl |

Override with `--provider <name>` or explicit flags (`--news`, `--academic`, `--social`).

## Fallback Chains

URL-based commands use sequential fallback — try the best provider first, fall back on failure:

| Command | Chain |
|---------|-------|
| `read` | Jina → Firecrawl → Exa |
| `screenshot` | Jina → Firecrawl |
| `pdf` | Jina → Firecrawl |
| `answer` | Exa → Grok |

## Local Mode (Apple Silicon)

ML commands support `--local` for zero-cost inference on Apple Silicon via Jina's MLX server:

```bash
# Start the local server (once)
pip install jina-grep
jina grep serve start

# Use --local on any ML command
wit embed "hello world" --local
wit classify "great product" --labels "positive,negative" --local
wit dedup < items.txt --local
```

## Configuration

### API Keys

Three-level resolution (later wins):

1. Config file: `~/.config/wit/config.toml`
2. `WIT_KEYS_*` env vars (e.g., `WIT_KEYS_JINA`)
3. Standard env vars (e.g., `JINA_API_KEY`, `EXA_API_KEY`)
4. `.env` file in cwd or `~/Documents/Code/wit/`

```bash
# Set via CLI
wit config set keys.jina jina_xxx

# Or via env vars (most common)
export JINA_API_KEY=jina_xxx
export EXA_API_KEY=xxx
export FIRECRAWL_API_KEY=fc-xxx
export XAI_API_KEY=xai-xxx
```

### Cache

5-minute TTL cache. Bypass with `--no-cache`. Replay last result with `--last`.

### Audit Log

Every command is logged to `~/.local/share/wit/logs/YYYY-MM-DD.jsonl` with timestamps, providers, costs, and timing.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | API error |
| 2 | Config error |
| 3 | Auth error (missing API key) |
| 4 | Rate limited |
| 5 | No results |

## Provider Capabilities

| Capability | Jina | Exa | Firecrawl | Grok |
|------------|------|-----|-----------|------|
| Web search | + | + | + | + |
| News search | + | + | | |
| Academic search | + | | | |
| X/Twitter search | | | | + |
| URL reading | + | + | + | |
| Structured extraction | | | + | |
| Screenshots | + | | + | |
| Site crawl | | | + | |
| Site map | | | + | |
| Find similar | | + | | |
| Answer with citations | | + | | |
| Brand extraction | | | + | |
| Embeddings | + | | | |
| Reranking | + | | | |
| Classification | + | | | |
| Deduplication | + | | | |
| PDF extraction | + | | + | |
| Local MLX mode | + | | | |

## License

MIT
