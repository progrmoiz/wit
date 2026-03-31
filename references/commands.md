# wit Command Reference

## search

```
wit search <query> [options]
```

Smart-routed web search. Classifies query intent and routes to best provider(s).

| Option | Description | Default |
|--------|-------------|---------|
| `-n, --num <count>` | Number of results | 10 |
| `-p, --provider <name>` | Force provider (jina, exa, firecrawl, grok) | auto |
| `--news` | Search news only | |
| `--academic` | Search academic papers (arXiv) | |
| `--social` | Search X/Twitter via Grok | |
| `--domain <domains>` | Include only these domains (comma-separated) | |
| `--exclude <domains>` | Exclude these domains (comma-separated) | |
| `--since <period>` | Results after period: `1h`, `1d`, `1w`, `1m`, `1y`, or ISO date | |
| `--no-cache` | Bypass 5-min TTL cache | |
| `--json` | Force JSON output | |

**Routing:** academic→Jina, social→Grok, news→Exa+Jina, general→Exa+Jina+Firecrawl.

**Examples:**
```bash
wit search "AI embeddings" --num 5
wit search "transformer papers" --academic --since 1m
wit search "SaaS news" --news --domain techcrunch.com
wit search "tweets about AI" --social
```

---

## read

```
wit read [url] [options]
```

Read URL and convert to markdown. Supports stdin batch mode.

| Option | Description |
|--------|-------------|
| `--links` | Include hyperlinks in output |
| `--images` | Include images in output |
| `--selector <css>` | Target specific DOM element |
| `--wait <ms>` | Wait for JS rendering |
| `-p, --provider <name>` | Force provider |
| `--json` | Force JSON output |

**Fallback chain:** Jina → Firecrawl → Exa.

**Examples:**
```bash
wit read https://example.com
wit read https://example.com --links --images
wit read https://example.com --selector "article.main-content"
cat urls.txt | wit read --json
```

---

## x

```
wit x <query> [options]
```

Search X/Twitter. Grok exclusive — no other provider has this.

| Option | Description |
|--------|-------------|
| `-n, --num <count>` | Number of results (default: 10) |
| `--from <handle>` | Filter by author handle |
| `--since <date>` | Posts after date (YYYY-MM-DD or 1d/1w) |
| `--until <date>` | Posts before date (YYYY-MM-DD) |
| `--json` | Force JSON output |

**Examples:**
```bash
wit x "calculator SaaS"
wit x "AI tools" --from iammoizfarooq --since 2026-03-01
```

---

## answer

```
wit answer <question> [options]
```

Direct answer with citations. Exa Answer API ($0.005) with Grok fallback.

**Examples:**
```bash
wit answer "What is ActiveCalculator's pricing?"
wit answer "How does Exa's neural search work?" --json
```

---

## similar

```
wit similar <url> [options]
```

Find semantically similar pages. Exa exclusive.

| Option | Description |
|--------|-------------|
| `-n, --num <count>` | Number of results (default: 10) |
| `--json` | Force JSON output |

**Examples:**
```bash
wit similar https://activecalculator.com --num 5
```

---

## company

```
wit company <url> [options]
```

Company intelligence profile. Fires 8 parallel Exa searches: homepage summary, LinkedIn, funding, news, GitHub, Twitter, Crunchbase, competitors.

**Examples:**
```bash
wit company https://exa.ai
wit company activecalculator.com --json | jq '.data.competitors'
```

---

## research

```
wit research <topic> [options]
```

Deep research. Two modes:

1. **Exa Research API** (with `--model`): Async job, polls until complete
2. **Multi-step pipeline** (default): search → read top N → combine

| Option | Description |
|--------|-------------|
| `--model <tier>` | Exa Research API: `fast`, `standard`, `pro` |
| `--depth <level>` | `shallow`, `standard`, `deep` |
| `--max-sources <n>` | Max sources to read (default: 5) |
| `--json` | Force JSON output |

**Examples:**
```bash
wit research "AI embeddings landscape"
wit research "quantum computing applications" --model pro
wit research "SaaS pricing strategies" --max-sources 10
```

---

## extract

```
wit extract <url> [options]
```

Structured data extraction via Firecrawl.

| Option | Description |
|--------|-------------|
| `--schema <json>` | JSON Schema for extraction |
| `--prompt <text>` | Natural language instruction |
| `--json` | Force JSON output |

**Examples:**
```bash
wit extract https://example.com/pricing --prompt "Extract all pricing tiers with names and prices"
wit extract https://example.com --schema '{"type":"object","properties":{"title":{"type":"string"},"price":{"type":"number"}}}'
```

---

## brand

```
wit brand <url> [options]
```

Extract complete brand identity via Firecrawl: colors, fonts, typography scale, spacing, logo, UI components, personality/tone.

---

## screenshot

```
wit screenshot <url> [options]
```

Screenshot a URL. Fallback: Jina → Firecrawl.

| Option | Description |
|--------|-------------|
| `--full-page` | Capture full page |
| `--output <file>` | Save to file |
| `--json` | Force JSON output |

---

## crawl

```
wit crawl <url> [options]
```

Full async site crawl via Firecrawl. Polls every 2s until complete (max 2 min).

| Option | Description |
|--------|-------------|
| `--limit <n>` | Max pages (default: 100) |
| `--depth <n>` | Max depth (default: 3) |
| `--json` | Force JSON output |

---

## download

```
wit download <url> [options]
```

Map a site's URLs then download each as local markdown. Firecrawl map + read.

| Option | Description |
|--------|-------------|
| `--output <dir>` | Output directory (default: `.`) |
| `--limit <n>` | Max pages (default: 50) |
| `--json` | Force JSON output |

---

## monitor

```
wit monitor <url> [options]
```

One-off change detection via Firecrawl's changeTracking format.

---

## pdf

```
wit pdf <url-or-arxiv-id> [options]
```

Extract figures, tables, equations from PDFs. Accepts arXiv IDs directly.

| Option | Description |
|--------|-------------|
| `--type <types>` | Filter: `figure`, `table`, `equation` (comma-separated) |
| `--json` | Force JSON output |

**Examples:**
```bash
wit pdf https://example.com/paper.pdf
wit pdf 2301.12345 --type figure
```

---

## embed

```
wit embed [texts...] [options]
```

Generate text embeddings via Jina. Reads from args or stdin.

| Option | Description |
|--------|-------------|
| `--model <name>` | Model (default: `jina-embeddings-v5-text-small`) |
| `--task <task>` | Task: `text-matching`, `retrieval.query`, `retrieval.passage` |
| `--dimensions <n>` | Output dimensions (Matryoshka) |
| `--local` | Use local MLX server (localhost:8089) |
| `--json` | Force JSON output |

---

## rank

```
wit rank <query> [options]
```

Rerank documents from stdin against a query. Jina reranker.

| Option | Description |
|--------|-------------|
| `-n, --num <count>` | Top N results |
| `--local` | Use local server |
| `--json` | Force JSON output |

**Example:** `cat docs.txt | wit rank "relevant query"`

---

## classify

```
wit classify [texts...] [options]
```

Zero-shot text classification via Jina embeddings.

| Option | Description |
|--------|-------------|
| `--labels <labels>` | **Required.** Comma-separated labels |
| `--local` | Use local server |
| `--json` | Force JSON output |

**Example:** `echo "great product" | wit classify --labels "positive,negative,neutral"`

---

## dedup

```
wit dedup [options]
```

Deduplicate text items from stdin. Uses Jina embeddings + greedy facility-location selection.

| Option | Description |
|--------|-------------|
| `-k <count>` | Max unique items to keep |
| `--local` | Use local server |
| `--json` | Force JSON output |

**Example:** `cat items.txt | wit dedup -k 10`

---

## grep

```
wit grep <pattern> [path] [flags...]
```

Semantic code search via jina-grep (local MLX). Passes through all arguments.

Requires: `pip install jina-grep` + `jina grep serve start`.

---

## config

```
wit config show             # Full config with masked keys
wit config check            # Provider health check
wit config set <key> <val>  # Set value (e.g., keys.jina)
```

---

## agent-info

```
wit agent-info
```

Machine-readable JSON with all commands, providers, capabilities, exit codes. Always outputs JSON regardless of terminal.
