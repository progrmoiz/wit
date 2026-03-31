---
name: wit
description: Web Intelligence Toolkit — unified CLI for web search, scraping, research, and ML ops across Jina, Exa, Firecrawl, and Grok. Use for any web intelligence task.
---

# wit — Web Intelligence Toolkit

CLI that unifies Jina, Exa, Firecrawl, and Grok. Smart-routes to best provider per task.

## When to Use

- Web search (semantic, news, academic, X/Twitter)
- Read/scrape any URL to markdown
- Structured data extraction from web pages
- Company intelligence (8 parallel searches)
- Deep research (multi-source or Exa Research API)
- Find similar pages to a URL
- Get direct answers with citations
- Screenshots, brand extraction, PDF extraction
- Site crawling and downloading
- Text embeddings, reranking, classification, deduplication
- Semantic code search (local MLX)

## Output

All commands output JSON when piped (auto-detected). Every response has:

```json
{
  "version": "1",
  "status": "success|partial_success|all_providers_failed|no_results|error",
  "command": "search",
  "data": ...,
  "metadata": { "elapsed_ms": 1500, "providers_used": ["exa"], "cached": false }
}
```

Always pipe to `jq` for field extraction:
```bash
wit search "query" --json | jq -r '.data[0].url'
```

## Commands

### Search
```bash
wit search "AI embeddings"                    # Smart-routed (Exa + Jina)
wit search "transformer papers" --academic    # Academic (Jina arXiv)
wit search "AI funding news" --news           # News (Exa + Jina)
wit search "tweets about AI" --social         # X/Twitter (Grok)
wit search "query" --provider exa             # Force specific provider
wit search "query" --num 5 --since 1w         # 5 results from last week
wit search "query" --domain example.com       # Restrict to domain
```

### Read
```bash
wit read https://example.com                  # URL to markdown (Jina → Firecrawl → Exa)
wit read https://example.com --links          # Include hyperlinks
wit read https://example.com --selector main  # Target specific element
cat urls.txt | wit read                       # Batch read from stdin
```

### X/Twitter
```bash
wit x "ActiveCalculator"                      # Search X (Grok exclusive)
wit x "AI tools" --from iammoizfarooq         # Filter by handle
wit x "SaaS" --since 2026-03-01               # Date filter
```

### Answer
```bash
wit answer "What is Exa's pricing?"           # Direct answer with citations (Exa → Grok)
```

### Similar
```bash
wit similar https://activecalculator.com      # Find similar pages (Exa)
```

### Company
```bash
wit company https://exa.ai                    # Full company profile (8 parallel Exa searches)
wit company activecalculator.com --json | jq '.data.competitors'  # Just competitors
```

### Extract
```bash
wit extract https://example.com --prompt "Extract pricing tiers"
wit extract https://example.com --schema '{"type":"object","properties":{"name":{"type":"string"},"price":{"type":"number"}}}'
```

### Research
```bash
wit research "AI embeddings landscape"                    # Multi-step: search → read → combine
wit research "AI embeddings" --model fast                 # Exa Research API (fast tier)
wit research "quantum computing" --model pro              # Exa Research API (pro tier)
wit research "topic" --max-sources 10                     # Read more sources
```

### Screenshots & Brand
```bash
wit screenshot https://example.com                        # Screenshot (Jina → Firecrawl)
wit screenshot https://example.com --output shot.png      # Save to file
wit brand https://example.com                             # Brand identity extraction (Firecrawl)
```

### Crawl & Download
```bash
wit crawl https://docs.example.com --limit 50             # Full site crawl (Firecrawl async)
wit download https://docs.example.com --output ./docs     # Download as local markdown files
wit monitor https://example.com/pricing                   # Track page changes
```

### ML Operations
```bash
wit embed "hello world"                       # Generate embeddings (Jina)
wit embed "text1" "text2" --local             # Local MLX mode (Apple Silicon)
cat docs.txt | wit rank "relevance query"     # Rerank documents
wit classify "great product" --labels "positive,negative,neutral"
cat items.txt | wit dedup                     # Deduplicate via embeddings
wit grep "authentication" src/                # Semantic code search (local)
```

### PDF
```bash
wit pdf https://example.com/paper.pdf         # Extract figures/tables
wit pdf 2301.12345                            # arXiv paper by ID
wit pdf 2301.12345 --type figure              # Only figures
```

### System
```bash
wit config check                              # Which providers are configured
wit config show                               # Full config with masked keys
wit config set keys.exa xxx                   # Set API key
wit agent-info                                # Machine-readable capabilities (always JSON)
wit --last                                    # Replay last result
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | API error |
| 2 | Config error |
| 3 | Auth error |
| 4 | Rate limited |
| 5 | No results |

## Providers

| Provider | Key Env Var | Capabilities |
|----------|-------------|-------------|
| Jina | `JINA_API_KEY` | search, read, screenshot, embed, rerank, classify, dedup, pdf, academic search |
| Exa | `EXA_API_KEY` | search, read, similar, answer, company, research, news search |
| Firecrawl | `FIRECRAWL_API_KEY` | search, read, extract, screenshot, brand, crawl, map, download, monitor |
| Grok | `XAI_API_KEY` | search, X/Twitter search |
