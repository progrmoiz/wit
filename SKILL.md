---
name: wit
description: "Unified web intelligence CLI. Searches, reads, extracts, researches across Jina, Exa, Firecrawl, and Grok."
when_to_use: "Use when searching the web, reading URLs, extracting data, researching topics, or running ML ops (embed, rank, classify, dedup). Also for X/Twitter search, company intel, brand extraction, site crawling."
allowed-tools:
  - Bash(wit:*)
  - Bash(node:*)
  - Read
---

# wit — Web Intelligence Toolkit

CLI that smart-routes to the best provider per task. Auto-JSON when piped. Fallback chains on failure.

## Quick Reference

```bash
wit search "query"                    # Web search (Exa + Jina parallel)
wit read <url>                        # URL to markdown (Jina → Firecrawl → Exa)
wit answer "question"                 # Answer with citations (Exa → Grok)
wit company <url>                     # Company intel (8 parallel Exa searches)
wit x "query"                         # X/Twitter search (Grok)
wit extract <url> --prompt "..."      # Structured extraction (Firecrawl)
wit research "topic"                  # Deep research (multi-step or Exa API)
wit similar <url>                     # Find similar pages (Exa)
wit embed "text" [--local]            # Embeddings (Jina, local MLX optional)
wit rank "query" < docs.txt           # Rerank from stdin (Jina)
wit classify "text" --labels "a,b,c"  # Zero-shot classify (Jina)
cat items.txt | wit dedup             # Deduplicate via embeddings (Jina)
```

**Output:** Always JSON when piped (`!process.stdout.isTTY`). Force with `--json`. Parse with `jq -r '.data[0].url'`.

**Envelope:** Every response: `{version:"1", status, command, data, metadata:{elapsed_ms, providers_used, cached, cost_usd}}`.

## Piping Patterns

```bash
wit search "AI" --json | jq -r '.data[0].url' | wit read       # Search → Read
wit search "ML" --json | jq -r '.data[].snippet' | wit dedup   # Search → Dedup
wit company x.com --json | jq '.data.competitors'              # Company → Competitors
cat urls.txt | wit read                                         # Batch read
```

## Flags

| Global | Effect |
|--------|--------|
| `--json` | Force JSON output |
| `--quiet` | Suppress stderr status bar |
| `--verbose` | Debug: show provider URLs |
| `--last` | Replay last cached result |
| `--no-cache` | Skip 5-min TTL cache |
| `-p, --provider <name>` | Force: jina, exa, firecrawl, grok |

## Search Routing

The `search` command auto-classifies intent:

| Flag / Pattern | Routes to |
|---|---|
| `--academic`, "paper", "arxiv" | Jina (arXiv) |
| `--social`, "tweets", "@handle" | Grok |
| `--news`, "latest", "breaking" | Exa + Jina |
| "who is", "linkedin" | Exa (people) |
| "funding", "startup" | Exa (company) |
| Default | Exa + Jina + Firecrawl (parallel) |

## All Commands

See [references/commands.md](references/commands.md) for full options per command.

| Command | Provider(s) | Key Options |
|---------|-------------|-------------|
| `search <query>` | Exa+Jina+Firecrawl | `--num`, `--news`, `--academic`, `--social`, `--domain`, `--since` |
| `read [url]` | Jina→Firecrawl→Exa | `--links`, `--images`, `--selector`, stdin batch |
| `answer <q>` | Exa→Grok | |
| `similar <url>` | Exa | `--num` |
| `x <query>` | Grok | `--from`, `--since`, `--until` |
| `company <url>` | Exa | 8 parallel searches (linkedin, funding, news, github, competitors) |
| `research <topic>` | Exa+Jina | `--model fast\|standard\|pro`, `--max-sources` |
| `extract <url>` | Firecrawl | `--schema <json>`, `--prompt` |
| `brand <url>` | Firecrawl | Colors, fonts, spacing, tone |
| `screenshot <url>` | Jina→Firecrawl | `--output <file>`, `--full-page` |
| `crawl <url>` | Firecrawl | `--limit`, `--depth` (async poll) |
| `download <url>` | Firecrawl | `--output <dir>`, `--limit` |
| `monitor <url>` | Firecrawl | changeTracking format |
| `pdf <url\|arxiv-id>` | Jina→Firecrawl | `--type figure,table,equation` |
| `embed [texts...]` | Jina | `--local`, `--model`, `--dimensions`, stdin |
| `rank <query>` | Jina | `--num`, `--local`, stdin docs |
| `classify [texts...]` | Jina | `--labels` (required), `--local`, stdin |
| `dedup` | Jina | `-k`, `--local`, stdin |
| `grep <pattern>` | jina-grep | All GNU grep flags + `--threshold` |
| `config show\|check\|set` | — | |
| `agent-info` | — | Always JSON |

## Exit Codes

0=success, 1=api_error, 2=config_error, 3=auth_error, 4=rate_limited, 5=no_results.

## Providers

| Provider | Env Var | Strengths |
|----------|---------|-----------|
| Jina | `JINA_API_KEY` | Best markdown, academic search, embeddings, rerank, classify, dedup, local MLX |
| Exa | `EXA_API_KEY` | Semantic search, similar, answer, company data, research API |
| Firecrawl | `FIRECRAWL_API_KEY` | JS-heavy scraping, extraction, brand, crawl, site download |
| Grok | `XAI_API_KEY` | X/Twitter search (exclusive), web search with reasoning |

Check status: `wit config check`. Set keys: `wit config set keys.jina <key>` or env vars.

## Gotchas

- **Firecrawl extract schema goes in `--schema`, not `--prompt`.** `--prompt` is natural language instruction. `--schema` is JSON Schema. Use both together for best results.
- **`--no-cache` uses Commander negation.** Internally it sets `cache: false`, not `noCache: true`. If writing scripts, check the JSON envelope `metadata.cached` field.
- **Jina search vs read use different quotas.** Search can be 402 (out of credits) while read still works. Check both independently.
- **Grok x_search returns text, not structured results.** If `wit x` shows 0 results but the provider succeeded, the citation parsing found no `url_citation` annotations in the response. The text answer is in the raw response but not surfaced as SearchResults.
- **`--local` requires `pip install jina-grep` and `jina grep serve start`.** Without the local MLX server running on localhost:8089, `--local` mode will fail with a connection error.
- **Company command fires 8 parallel API calls.** Each costs ~$0.005 on Exa. Total ~$0.04 per company profile. Watch usage on free tiers.
- **Cache key includes provider flag.** `wit search "x"` and `wit search "x" --provider exa` have different cache keys. `--no-cache` bypasses all caching.
