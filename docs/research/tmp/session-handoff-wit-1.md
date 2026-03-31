# Session Handoff — wit CLI (Session 1)
### Continue from here in the next session

*Session date: Tuesday, March 31, 2026*
*Previous sessions: None — this is the first session*
*Status: wit CLI fully built (21 commands, 4 providers), audited, all critical/high/medium/low issues fixed, pushed to GitHub public at progrmoiz/wit*

---

## What This Session Was About

Built `wit` — a unified Web Intelligence Toolkit CLI that routes to the best provider per task across Jina, Exa, Firecrawl, and Grok/xAI. The session started with deep research into all four provider ecosystems (8,296+ lines across 11 research docs), studied an existing competitor (199-biotechnologies/search-cli, Rust, 11 providers), extracted best practices, then built the CLI from scratch in 3 phases.

The motivation: Moiz has all four providers as MCP servers in Claude Code but wanted a unified CLI for piping, composability, and use outside Claude Code. Each provider excels at different tasks — Jina for academic search + embeddings + local MLX, Exa for semantic search + company data, Firecrawl for JS-heavy scraping + extraction, Grok for X/Twitter search. No single tool covers everything.

After building, we ran a full CLI audit (/cli-audit skill) that found 21 issues across 4 severity levels. All were fixed. README.md and SKILL.md were created. Repo pushed to GitHub.

## What We Decided

### Architecture: TypeScript CLI with Commander.js
- **Why:** Moiz's stack is TypeScript. Provider SDKs all available in JS. Raw HTTP calls via native fetch (no provider SDK deps) for minimal footprint and full control.

### 4 providers, no more
- **Why:** Evaluated Tavily, Brave, Perplexity, SerpAPI — none fill a gap the current 4 don't cover. Brave's independent index is the only unique thing missing, but it's not a felt need.

### Smart routing with weighted regex classification
- **Why:** search-cli's first-match-wins regex was fragile ("latest research papers" matched News before Academic). Weighted scoring fixes this — academic (weight 8) beats news (weight 5).

### Tool for us, not a product
- **Why:** No polish/publish/tests needed. Skip Phase 4 (tests, CI, npm publish) until it proves useful day-to-day.

### Auto-JSON when piped
- **Why:** Best practice from search-cli. `!process.stdout.isTTY` → JSON output. Agents get structured data automatically.

### Sequential fallback chains for URL operations
- **Why:** Each provider has different strengths for the same task. Jina has best markdown quality but can't handle all JS-heavy pages. Firecrawl handles JS but costs more. Try cheap/fast first.

### .env loading from 3 locations
- **Why:** API keys were in ~/Documents/Code/mcp-servers/.env already. Loading from cwd, wit project root, and mcp-servers means no reconfiguration needed.

## What Changed in the Codebase

### Files Created (all in ~/Documents/Code/wit/)

**Infrastructure:**
- `package.json` — deps: commander, @iarna/toml, zod, chalk, ora
- `tsconfig.json` — ES2022, bundler moduleResolution
- `tsup.config.ts` — esbuild ESM bundle with shebang
- `.gitignore` — node_modules, dist, .env
- `.env` — API keys for all 4 providers (gitignored)

**Core:**
- `src/index.ts` — Commander program with 21 commands, --quiet/--verbose/--last global flags, uncaughtException + unhandledRejection handlers
- `src/types/index.ts` — SearchResult, ReadResult, ExtractResult, WitResponse envelope, all option types
- `src/errors/index.ts` — ExitCode enum (0-5), WitError class, mapHttpStatus, captureError helper
- `src/config/index.ts` — .env loader (3 locations), TOML config, resolveKey with triple fallback
- `src/output/index.ts` — auto-JSON detection, table formatter, status bar, NO_COLOR support, debug(), logCommand integration
- `src/logging/index.ts` — JSONL audit logger to ~/.local/share/wit/logs/
- `src/cache/index.ts` — SHA-256 TTL cache, last.json replay, cleanup eviction
- `src/router/index.ts` — weighted intent classifier, provider routing table
- `src/utils/http.ts` — fetch with retry (3x backoff), timeout, Retry-After header respect, debug logging
- `src/utils/url.ts` — URL normalization (tracking params, www, protocol, query sort)
- `src/utils/stdin.ts` — stdin reader for piping

**Providers:**
- `src/providers/index.ts` — Provider interface, buildProviders() lazy singleton, getProvidersFor()
- `src/providers/jina.ts` — search, searchNews, searchAcademic, read, screenshot, embed, rerank, classify, dedup (facility-location), pdf
- `src/providers/exa.ts` — search, searchNews, read, similar (findSimilar), answer
- `src/providers/firecrawl.ts` — search, read, extract (JSON format + jsonOptions), screenshot, brand, map
- `src/providers/grok.ts` — search (web_search), searchSocial (x_search with structured tool params)

**Commands (21):**
- `src/commands/search.ts` — smart-routed with cache, fan-out, intent classification
- `src/commands/read.ts` — fallback chain, stdin batch
- `src/commands/similar.ts` — Exa findSimilar
- `src/commands/answer.ts` — Exa → Grok fallback
- `src/commands/x.ts` — Grok x_search with from/since/until
- `src/commands/extract.ts` — Firecrawl JSON extraction
- `src/commands/screenshot.ts` — Jina → Firecrawl fallback
- `src/commands/brand.ts` — Firecrawl branding
- `src/commands/crawl.ts` — Firecrawl async crawl with poll loop
- `src/commands/embed.ts` — Jina embed with --local
- `src/commands/rank.ts` — Jina rerank from stdin
- `src/commands/classify.ts` — Jina classify with --labels
- `src/commands/dedup.ts` — Jina dedup from stdin
- `src/commands/pdf.ts` — Jina → Firecrawl fallback
- `src/commands/company.ts` — 8 parallel Exa searches
- `src/commands/research.ts` — Exa Research API or multi-step pipeline
- `src/commands/download.ts` — Firecrawl map + batch read
- `src/commands/monitor.ts` — Firecrawl changeTracking
- `src/commands/grep.ts` — delegates to jina-grep subprocess
- `src/commands/agent-info.ts` — capability discovery JSON
- `src/commands/config-cmd.ts` — show/check/set

**Docs:**
- `README.md` — ASCII banner, full docs, command tables, piping examples, provider matrix
- `SKILL.md` — agent-discoverable with frontmatter (when_to_use, allowed-tools), 7 gotchas
- `references/commands.md` — full command reference with all options

### Also Changed (in life-os repo)

- **Exa MCP updated:** Added `web_search_advanced_exa` tool (was missing — unlocks category filters, date ranges, domain restrictions)
- **Jina MCP optimized:** Added `?exclude_tags=parallel` to URL (removes 4 redundant tools, saves context tokens)
- **Research docs:** 11 files in `content/research/web-intelligence-toolkit/` totaling 8,296+ lines

## What Was NOT Done Yet

1. **Grok x_search citation parsing** — returns text but `url_citation` annotations aren't being extracted properly. Need to debug the Grok Responses API response structure.
2. **Firecrawl credits** — account has 0 credits. All Firecrawl commands (extract, brand, crawl, download, monitor, screenshot fallback) fail with 402. Needs account top-up at firecrawl.dev/pricing.
3. **Jina search credits** — was 402, now working again. May need monitoring.
4. **npm publish** — not done (tool for us, not a product yet).
5. **Tests** — no unit or integration tests.
6. **CLAUDE.md** — no CLAUDE.md in the wit repo for project-specific instructions.
7. **MCP server mode** — wit is CLI-only. Could also serve as an MCP server for use within Claude Code.
8. **JSONL cost reporting** — `wit cost` command to parse audit logs and show spend by provider/command/day.

## Research Conducted

11 research docs saved to `~/Documents/Code/life-os/content/research/web-intelligence-toolkit/`:

| File | Lines | What |
|------|-------|------|
| `_index.md` | 136 | Overview, capability matrix, quick wins, CLI concept |
| `JINA-ECOSYSTEM.md` | 423 | All 21 MCP tools, 13 CLI commands, API reference |
| `JINA-SOURCE-DEEP.md` | 615 | CLI source internals, Reader 8-step pipeline, 14 undocumented features, pricing |
| `JINA-DEEP-RESEARCH-DEEP.md` | 719 | Complete DeepResearch algorithm (11 steps), 5 eval types, config options |
| `EXA-ECOSYSTEM.md` | 591 | 10 products, company researcher 18-call pattern, exa-skills |
| `EXA-DOCS-DEEP.md` | 1413 | Complete API reference, 12 categories, 20+ error codes, rate limits, pricing |
| `EXA-ADVANCED-DEEP.md` | 1532 | Websets, Research API, Search Monitors, JS vs Python SDK |
| `FIRECRAWL-ECOSYSTEM.md` | 768 | 14 MCP tools, 15 CLI commands, 15 experimental workflows |
| `FIRECRAWL-SOURCE-DEEP.md` | 1710 | API server architecture, 30+ routes, scrape pipeline, billing formulas |
| `ECOSYSTEM-SCAN.md` | 389 | 40+ repos scanned, 5 unified CLI attempts found |
| `SEARCH-CLI-DEEP.md` | 467 | search-cli architecture, 10 patterns to steal, 12 weaknesses |
| `PROVIDER-ASSESSMENT.md` | 253 | xAI/Grok, Tavily, Brave, Perplexity, SerpAPI evaluation |
| `IMPLEMENTATION-PLAN.md` | 15 | Pointer to full plan delivered in-session |

**Key findings:**
1. Exa's `web_search_advanced_exa` was disabled — we enabled it (one config change)
2. Jina's parallel MCP tools are redundant — singleton tools accept arrays natively
3. Grok is underutilized — 17 MCP tools installed, only using 2 for tweet checks
4. Someone built a unified search CLI (search-cli, Rust) but none are MCP-native
5. Firecrawl has 15 pre-built experimental multi-agent workflows in the CLI
6. Jina has local MLX mode for zero-cost embeddings on Apple Silicon

## Current State of Key Files

| File | Status |
|------|--------|
| `~/Documents/Code/wit/` | Complete, built, globally linked as `wit` |
| `~/Documents/Code/wit/.env` | 4 API keys (Jina, Exa, Firecrawl, Grok) |
| `~/Documents/Code/wit/dist/index.js` | Built (92.5 KB), executable |
| `~/Documents/Code/wit/README.md` | Complete |
| `~/Documents/Code/wit/SKILL.md` | Complete with frontmatter + gotchas |
| `~/Documents/Code/wit/references/commands.md` | Complete command reference |
| `~/.local/share/wit/logs/2026-03-31.jsonl` | 16 entries from testing |
| `~/.cache/wit/` | Active, has cached results |
| GitHub: progrmoiz/wit | Public, all commits pushed |

## Key Insights Worth Remembering

1. **Commander `--no-cache` sets `cache: false`, not `noCache: true`.** Need to check both in code.
2. **`--last` flag must be intercepted BEFORE Commander.parse()** because it needs no subcommand. Handle it with `process.argv.includes('--last')` before program setup.
3. **`process.exit(0)` can truncate stdout.** Use `return` for success, `process.exitCode = N; return;` for errors.
4. **Firecrawl v2 extract format is `formats: ["json"]` + `jsonOptions: {schema, prompt}`**, not `formats: [{type:"json", schema}]`.
5. **Grok Responses API nests content in `output[].content[].annotations[]`** — url_citation annotations contain the search results.
6. **Jina Reader read works without credits but search doesn't** — different quota pools.
7. **`buildProviders()` should be a lazy singleton** — creating all 4 providers on every command is wasteful.

## File Paths Quick Reference

```
# Project
~/Documents/Code/wit/                          # Main project
~/Documents/Code/wit/src/                      # Source code (36 files)
~/Documents/Code/wit/dist/index.js             # Built CLI
~/Documents/Code/wit/.env                      # API keys (gitignored)
~/Documents/Code/wit/README.md                 # Documentation
~/Documents/Code/wit/SKILL.md                  # Agent skill file
~/Documents/Code/wit/references/commands.md    # Command reference

# Runtime
~/.config/wit/config.toml                      # User config (TOML)
~/.cache/wit/                                  # Query cache + last.json
~/.local/share/wit/logs/                       # JSONL audit logs

# Research (in life-os repo)
~/Documents/Code/life-os/content/research/web-intelligence-toolkit/  # 11 research docs

# API keys source
~/Documents/Code/mcp-servers/.env              # Shared API keys

# GitHub
https://github.com/progrmoiz/wit               # Public repo
```

## How to Start Next Session

### Option 1: Fix Grok x_search parsing
```
The wit CLI's `wit x` command connects to Grok but returns 0 results because url_citation annotations aren't being parsed correctly from the Responses API. Debug the response format in src/providers/grok.ts — the parseGrokResponse method needs to handle the actual response structure. Test with: wit --verbose x "AI tools" --json
```

### Option 2: Add remaining features
```
The wit CLI at ~/Documents/Code/wit is complete with 21 commands. Read the handoff at docs/research/tmp/session-handoff-wit-1.md. Pending items: (1) wit cost command to report JSONL log spending, (2) MCP server mode so wit can be used from Claude Code directly, (3) CLAUDE.md for the wit repo. Start with whichever is highest value.
```

### Option 3: Test and use in real workflow
```
The wit CLI is globally linked. Test it in a real workflow: run `wit company https://activecalculator.com` to profile AC, `wit search "calculator builder alternatives"` for competitive intel, `wit similar https://activecalculator.com` for competitor discovery. See ~/Documents/Code/wit/SKILL.md for all commands. Report any issues found.
```
