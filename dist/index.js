#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { z } from 'zod';

// src/errors/index.ts
var ExitCode = /* @__PURE__ */ ((ExitCode2) => {
  ExitCode2[ExitCode2["Success"] = 0] = "Success";
  ExitCode2[ExitCode2["ApiError"] = 1] = "ApiError";
  ExitCode2[ExitCode2["ConfigError"] = 2] = "ConfigError";
  ExitCode2[ExitCode2["AuthError"] = 3] = "AuthError";
  ExitCode2[ExitCode2["RateLimited"] = 4] = "RateLimited";
  ExitCode2[ExitCode2["NoResults"] = 5] = "NoResults";
  return ExitCode2;
})(ExitCode || {});
var WitError = class extends Error {
  constructor(message, code, provider, suggestion) {
    super(message);
    this.code = code;
    this.provider = provider;
    this.suggestion = suggestion;
    this.name = "WitError";
  }
  toJSON() {
    return {
      code: ExitCode[this.code].toLowerCase(),
      message: this.message,
      suggestion: this.suggestion ?? "",
      provider: this.provider
    };
  }
};
function mapHttpStatus(status, provider) {
  switch (status) {
    case 401:
    case 403:
      return new WitError(
        `Authentication failed for ${provider}`,
        3 /* AuthError */,
        provider,
        `Check your API key. Run: wit config check`
      );
    case 402:
      return new WitError(
        `Billing/credits exhausted for ${provider}`,
        1 /* ApiError */,
        provider,
        `Top up your ${provider} account`
      );
    case 429:
      return new WitError(
        `Rate limited by ${provider}`,
        4 /* RateLimited */,
        provider,
        `Wait and retry, or reduce request frequency`
      );
    default:
      if (status >= 500) {
        return new WitError(
          `Server error from ${provider} (${status})`,
          1 /* ApiError */,
          provider,
          `Retry in a moment`
        );
      }
      return new WitError(
        `HTTP ${status} from ${provider}`,
        1 /* ApiError */,
        provider
      );
  }
}

// src/utils/http.ts
var RETRY_BACKOFF = [1e3, 2e3, 4e3];
var RETRYABLE_STATUSES = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
async function request(url, opts) {
  const { method = "GET", headers = {}, body, timeout = 3e4, provider } = opts;
  let lastError = null;
  for (let attempt = 0; attempt <= RETRY_BACKOFF.length; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "wit-cli/0.1.0",
          ...headers
        },
        body: body ? JSON.stringify(body) : void 0,
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!response.ok) {
        if (RETRYABLE_STATUSES.has(response.status) && attempt < RETRY_BACKOFF.length) {
          const retryAfter = response.headers.get("retry-after");
          const delay = retryAfter ? parseInt(retryAfter, 10) * 1e3 : RETRY_BACKOFF[attempt];
          await sleep(delay);
          continue;
        }
        throw mapHttpStatus(response.status, provider);
      }
      return await response.json();
    } catch (err) {
      if (err instanceof WitError) throw err;
      lastError = err;
      if (err.name === "AbortError") {
        throw new WitError(
          `Request to ${provider} timed out after ${timeout}ms`,
          1 /* ApiError */,
          provider,
          "Try again or increase timeout"
        );
      }
      if (attempt < RETRY_BACKOFF.length) {
        await sleep(RETRY_BACKOFF[attempt]);
        continue;
      }
    }
  }
  throw new WitError(
    `Network error with ${provider}: ${lastError?.message ?? "unknown"}`,
    1 /* ApiError */,
    provider,
    "Check your internet connection"
  );
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/providers/jina.ts
var READER_BASE = "https://r.jina.ai/";
var SEARCH_BASE = "https://svip.jina.ai/";
var JinaProvider = class {
  constructor(getKey) {
    this.getKey = getKey;
  }
  name = "jina";
  capabilities = {
    search: true,
    searchNews: true,
    searchAcademic: true,
    read: true,
    screenshot: true,
    pdf: true,
    // ML ops (Phase 3)
    embed: true,
    rerank: true,
    classify: true,
    dedup: true
  };
  isConfigured() {
    return this.getKey().length > 0;
  }
  timeout(task) {
    if (task === "screenshot" || task === "pdf") return 6e4;
    return 3e4;
  }
  async search(query, opts = {}) {
    const key = this.getKey();
    const body = {
      q: query,
      num: opts.num ?? 5
    };
    if (opts.tbs) body.tbs = opts.tbs;
    if (opts.since) body.tbs = parseSince(opts.since);
    const headers = {
      Accept: "application/json"
    };
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await request(SEARCH_BASE, {
      method: "POST",
      headers,
      body,
      provider: "jina",
      timeout: this.timeout("search")
    });
    return (res.data ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.description ?? r.content?.slice(0, 300) ?? "",
      source: "jina"
    }));
  }
  async searchNews(query, opts = {}) {
    return this.search(query, { ...opts, tbs: "qdr:d" });
  }
  async searchAcademic(query, opts = {}) {
    const key = this.getKey();
    const domain = opts.category === "ssrn" ? "ssrn" : "arxiv";
    const body = {
      q: query,
      num: opts.num ?? 5,
      domain
    };
    const headers = {
      Accept: "application/json"
    };
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await request(SEARCH_BASE, {
      method: "POST",
      headers,
      body,
      provider: "jina",
      timeout: this.timeout("search_academic")
    });
    return (res.data ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.description ?? r.content?.slice(0, 300) ?? "",
      source: `jina_${domain}`
    }));
  }
  async read(url, opts = {}) {
    const key = this.getKey();
    const headers = {
      Accept: "application/json",
      "X-Md-Link-Style": "discarded"
    };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (opts.links) headers["X-With-Links-Summary"] = "all";
    if (opts.images) {
      headers["X-With-Images-Summary"] = "true";
    } else {
      headers["X-Retain-Images"] = "none";
    }
    if (opts.selector) headers["X-Target-Selector"] = opts.selector;
    if (opts.wait) headers["X-Wait-For-Selector"] = opts.selector ?? "";
    const res = await request(READER_BASE, {
      method: "POST",
      headers,
      body: { url },
      provider: "jina",
      timeout: this.timeout("read")
    });
    const content = res.data?.content ?? "";
    return {
      url: res.data?.url ?? url,
      title: res.data?.title ?? "",
      content,
      published: res.data?.publishedTime,
      word_count: content.split(/\s+/).length,
      source: "jina"
    };
  }
};
function parseSince(since) {
  const map = {
    "1h": "qdr:h",
    h: "qdr:h",
    "1d": "qdr:d",
    d: "qdr:d",
    "1w": "qdr:w",
    w: "qdr:w",
    "1m": "qdr:m",
    m: "qdr:m",
    "1y": "qdr:y",
    y: "qdr:y"
  };
  return map[since.toLowerCase()] ?? since;
}
var ConfigSchema = z.object({
  keys: z.object({
    jina: z.string().default(""),
    exa: z.string().default(""),
    firecrawl: z.string().default(""),
    grok: z.string().default("")
  }).default({}),
  defaults: z.object({
    num_results: z.number().default(10),
    timeout: z.number().default(3e4),
    provider: z.string().default("")
  }).default({}),
  cache: z.object({
    enabled: z.boolean().default(true),
    ttl: z.number().default(300)
  }).default({}),
  logging: z.object({
    enabled: z.boolean().default(true),
    dir: z.string().default("")
  }).default({}),
  local: z.object({
    jina_grep_server: z.string().default("http://localhost:8089"),
    prefer_local: z.boolean().default(false)
  }).default({})
});
var CONFIG_DIR = join(homedir(), ".config", "wit");
var CONFIG_FILE = join(CONFIG_DIR, "config.toml");
join(homedir(), ".cache", "wit");
join(homedir(), ".local", "share", "wit", "logs");
function getConfigFile() {
  return CONFIG_FILE;
}
var cachedConfig = null;
function loadConfig() {
  if (cachedConfig) return cachedConfig;
  let fileConfig = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      fileConfig = parseSimpleToml(content);
    } catch {
    }
  }
  const result = ConfigSchema.parse(fileConfig);
  cachedConfig = result;
  return result;
}
function resolveKey(provider) {
  const config = loadConfig();
  const configKey = config.keys[provider];
  if (configKey) return configKey;
  const envMap = {
    jina: "JINA_API_KEY",
    exa: "EXA_API_KEY",
    firecrawl: "FIRECRAWL_API_KEY",
    grok: "XAI_API_KEY"
  };
  const witEnv = process.env[`WIT_KEYS_${provider.toUpperCase()}`];
  if (witEnv) return witEnv;
  return process.env[envMap[provider]] ?? "";
}
function isProviderConfigured(provider) {
  return resolveKey(provider).length > 0;
}
function setConfigValue(key, value) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  let content = "";
  if (existsSync(CONFIG_FILE)) {
    content = readFileSync(CONFIG_FILE, "utf-8");
  }
  const parts = key.split(".");
  if (parts.length === 2) {
    const section = `[${parts[0]}]`;
    const prop = parts[1];
    if (content.includes(section)) {
      const regex = new RegExp(`(\\[${parts[0]}\\][\\s\\S]*?)${prop}\\s*=\\s*"[^"]*"`, "m");
      if (regex.test(content)) {
        content = content.replace(regex, `$1${prop} = "${value}"`);
      } else {
        content = content.replace(section, `${section}
${prop} = "${value}"`);
      }
    } else {
      content += `
${section}
${prop} = "${value}"
`;
    }
  }
  writeFileSync(CONFIG_FILE, content, "utf-8");
  cachedConfig = null;
}
function parseSimpleToml(content) {
  const result = {};
  let currentSection = "";
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sectionMatch = trimmed.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      result[currentSection] = result[currentSection] ?? {};
      continue;
    }
    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch && currentSection) {
      const [, k, rawV] = kvMatch;
      let v = rawV.trim();
      if (v.startsWith('"') && v.endsWith('"') || v.startsWith("'") && v.endsWith("'")) {
        v = v.slice(1, -1);
      } else if (v === "true") {
        v = true;
      } else if (v === "false") {
        v = false;
      } else if (!isNaN(Number(v))) {
        v = Number(v);
      }
      result[currentSection][k] = v;
    }
  }
  return result;
}

// src/providers/index.ts
function buildProviders() {
  const providers = [];
  providers.push(new JinaProvider(() => resolveKey("jina")));
  return providers;
}
function getProvidersFor(task, providers) {
  return providers.filter((p) => p.capabilities[task] && p.isConfigured());
}

// src/output/index.ts
function detectFormat(jsonFlag) {
  if (jsonFlag) return "json";
  if (!process.stdout.isTTY) return "json";
  return "table";
}
function output(response, format) {
  if (format === "json") {
    const indent = process.stdout.isTTY ? 2 : 0;
    process.stdout.write(JSON.stringify(response, null, indent) + "\n");
    return;
  }
  printTable(response);
}
function printTable(response) {
  if (response.status === "error" && response.error) {
    process.stderr.write(`\x1B[31mError:\x1B[0m ${response.error.message}
`);
    if (response.error.suggestion) {
      process.stderr.write(`\x1B[2m${response.error.suggestion}\x1B[0m
`);
    }
    return;
  }
  const data = response.data;
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      process.stdout.write(`
 \x1B[1m${i + 1}\x1B[0m  \x1B[1;37m${r.title}\x1B[0m
`);
      process.stdout.write(`    \x1B[4;34m${r.url}\x1B[0m
`);
      if (r.snippet) {
        const snip = r.snippet.length > 200 ? r.snippet.slice(0, 200) + "..." : r.snippet;
        process.stdout.write(`    \x1B[2m${snip}\x1B[0m
`);
      }
      const meta = [r.source, r.published].filter(Boolean).join(" \xB7 ");
      if (meta) process.stdout.write(`    \x1B[2;36m${meta}\x1B[0m
`);
    }
    process.stdout.write("\n");
    printStatusBar(response);
    return;
  }
  if (data && typeof data === "object" && "content" in data) {
    const r = data;
    process.stdout.write(`\x1B[1;37m${r.title}\x1B[0m
`);
    process.stdout.write(`\x1B[4;34m${r.url}\x1B[0m
`);
    process.stdout.write(`\x1B[2m${r.word_count} words \xB7 ${r.source}\x1B[0m

`);
    process.stdout.write(r.content + "\n");
    return;
  }
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  printStatusBar(response);
}
function printStatusBar(response) {
  const parts = [];
  for (const p of response.metadata.providers_used) {
    parts.push(`\x1B[32m${p} \u2713\x1B[0m`);
  }
  for (const p of response.metadata.providers_failed) {
    parts.push(`\x1B[31m${p} \u2717\x1B[0m`);
  }
  if (response.metadata.result_count !== void 0) {
    parts.push(`${response.metadata.result_count} results`);
  }
  parts.push(`${response.metadata.elapsed_ms}ms`);
  if (response.metadata.cost_usd !== void 0) {
    parts.push(`$${response.metadata.cost_usd.toFixed(3)}`);
  }
  if (response.metadata.cached) {
    parts.push("\x1B[33mcached\x1B[0m");
  }
  process.stderr.write(`\x1B[2m ${parts.join("  |  ")} \x1B[0m
`);
}
function buildResponse(command, data, opts) {
  const elapsed = Date.now() - opts.startTime;
  const status = data === null ? "all_providers_failed" : opts.providersFailed.length > 0 ? "partial_success" : Array.isArray(data) && data.length === 0 ? "no_results" : "success";
  return {
    version: "1",
    status,
    command,
    query: opts.query,
    data,
    metadata: {
      elapsed_ms: elapsed,
      providers_used: opts.providersUsed,
      providers_failed: opts.providersFailed,
      cost_usd: opts.costUsd,
      cached: opts.cached ?? false,
      result_count: opts.resultCount ?? (Array.isArray(data) ? data.length : void 0)
    }
  };
}
function buildErrorResponse(command, error, startTime) {
  return {
    version: "1",
    status: "error",
    command,
    data: null,
    metadata: {
      elapsed_ms: Date.now() - startTime,
      providers_used: [],
      providers_failed: error.provider ? [error.provider] : [],
      cached: false
    },
    error
  };
}

// src/utils/url.ts
var TRACKING_PARAMS = /* @__PURE__ */ new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "fbclid",
  "gclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "yclid",
  "spm"
]);
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.protocol = "https:";
    u.hostname = u.hostname.replace(/^www\./, "");
    for (const param of TRACKING_PARAMS) {
      u.searchParams.delete(param);
    }
    u.searchParams.sort();
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}
function dedup(results) {
  const seen = /* @__PURE__ */ new Set();
  return results.filter((r) => {
    const norm = normalizeUrl(r.url);
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
}

// src/commands/search.ts
async function searchCommand(query, flags) {
  const startTime = Date.now();
  const format = detectFormat(flags.json);
  const providers = buildProviders();
  const task = flags.social ? "searchSocial" : flags.academic ? "searchAcademic" : flags.news ? "searchNews" : "search";
  let available = flags.provider ? providers.filter((p) => p.name === flags.provider) : getProvidersFor(task, providers);
  if (available.length === 0) {
    const resp2 = buildErrorResponse("search", {
      code: "no_providers",
      message: `No configured providers for ${task}`,
      suggestion: "Run: wit config check"
    }, startTime);
    output(resp2, format);
    process.exit(2 /* ConfigError */);
  }
  const opts = {
    num: flags.num ?? 10,
    since: flags.since
  };
  if (flags.domain) opts.domains = flags.domain.split(",");
  if (flags.exclude) opts.excludeDomains = flags.exclude.split(",");
  const results = [];
  const providersUsed = [];
  const providersFailed = [];
  const promises = available.map(async (p) => {
    try {
      const method = task === "searchAcademic" ? p.searchAcademic : task === "searchNews" ? p.searchNews : p.search;
      if (!method) return [];
      const r = await method.call(p, query, opts);
      providersUsed.push(p.name);
      return r;
    } catch (err) {
      providersFailed.push(p.name);
      return [];
    }
  });
  const allResults = await Promise.all(promises);
  for (const r of allResults) results.push(...r);
  const unique = dedup(results);
  const final = unique.slice(0, opts.num);
  const resp = buildResponse("search", final, {
    query,
    startTime,
    providersUsed,
    providersFailed,
    resultCount: final.length,
    costUsd: providersUsed.length * 0.01
    // rough estimate
  });
  output(resp, format);
  process.exit(resp.status === "error" || resp.status === "all_providers_failed" ? 1 /* ApiError */ : 0 /* Success */);
}

// src/utils/stdin.ts
async function readStdin() {
  if (process.stdin.isTTY) return [];
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8").split("\n").filter(Boolean);
}

// src/commands/read.ts
async function readCommand(url, flags) {
  const startTime = Date.now();
  const format = detectFormat(flags.json);
  let urls = [];
  if (url) {
    urls = [url];
  } else {
    urls = await readStdin();
  }
  if (urls.length === 0) {
    const resp = buildErrorResponse("read", {
      code: "missing_input",
      message: "No URL provided",
      suggestion: 'Usage: wit read <url> or echo "url" | wit read'
    }, startTime);
    output(resp, format);
    process.exit(2 /* ConfigError */);
  }
  const providers = buildProviders();
  const fallbackOrder = flags.provider ? [flags.provider] : ["jina", "firecrawl", "exa"];
  const available = fallbackOrder.map((name) => providers.find((p) => p.name === name && p.isConfigured() && p.capabilities.read)).filter(Boolean);
  if (available.length === 0) {
    const resp = buildErrorResponse("read", {
      code: "no_providers",
      message: "No configured providers for read",
      suggestion: "Set JINA_API_KEY, FIRECRAWL_API_KEY, or EXA_API_KEY"
    }, startTime);
    output(resp, format);
    process.exit(2 /* ConfigError */);
  }
  const opts = {
    links: flags.links,
    images: flags.images,
    selector: flags.selector,
    wait: flags.wait
  };
  for (const targetUrl of urls) {
    let result = null;
    const providersUsed = [];
    const providersFailed = [];
    for (const provider of available) {
      try {
        result = await provider.read(targetUrl, opts);
        providersUsed.push(provider.name);
        break;
      } catch {
        providersFailed.push(provider.name);
      }
    }
    const resp = buildResponse("read", result, {
      query: targetUrl,
      startTime,
      providersUsed,
      providersFailed
    });
    output(resp, format);
  }
  process.exit(0 /* Success */);
}

// src/commands/agent-info.ts
function agentInfoCommand() {
  const providers = buildProviders();
  const info = {
    name: "wit",
    version: "0.1.0",
    description: "Web Intelligence Toolkit \u2014 unified CLI for Jina, Exa, Firecrawl, and Grok",
    commands: [
      { name: "search", description: "Smart-routed web search", flags: ["--num", "--provider", "--news", "--academic", "--social", "--domain", "--exclude", "--since", "--json"] },
      { name: "read", description: "URL to markdown", flags: ["--links", "--images", "--selector", "--wait", "--provider", "--json"] },
      { name: "agent-info", description: "Machine-readable capability discovery", flags: [] },
      { name: "config", description: "Show/set configuration", flags: ["show", "set", "check"] },
      // Future commands listed for discovery
      { name: "extract", description: "Structured data extraction", flags: ["--schema", "--prompt", "--provider", "--json"] },
      { name: "x", description: "X/Twitter search", flags: ["--num", "--from", "--exclude", "--since", "--until", "--json"] },
      { name: "similar", description: "Find similar pages", flags: ["--num", "--json"] },
      { name: "answer", description: "Direct answer with citations", flags: ["--json"] },
      { name: "company", description: "Company intelligence", flags: ["--json"] },
      { name: "rank", description: "Rerank documents", flags: ["--num", "--json"] },
      { name: "classify", description: "Zero-shot classification", flags: ["--labels", "--local", "--json"] },
      { name: "dedup", description: "Deduplicate text from stdin", flags: ["--local", "--json"] },
      { name: "embed", description: "Generate embeddings", flags: ["--model", "--local", "--json"] },
      { name: "screenshot", description: "Screenshot a URL", flags: ["--full-page", "--output", "--json"] },
      { name: "crawl", description: "Full site crawl", flags: ["--limit", "--depth", "--json"] },
      { name: "brand", description: "Extract brand identity", flags: ["--json"] },
      { name: "pdf", description: "Extract from PDF", flags: ["--type", "--json"] },
      { name: "research", description: "Deep multi-source research", flags: ["--depth", "--model", "--schema", "--json"] },
      { name: "monitor", description: "Change tracking", flags: ["--json"] },
      { name: "download", description: "Download entire site", flags: ["--output"] },
      { name: "grep", description: "Semantic code search (local MLX)", flags: ["--threshold", "--top-k"] }
    ],
    providers: Object.fromEntries(
      providers.map((p) => [
        p.name,
        {
          configured: p.isConfigured(),
          capabilities: Object.entries(p.capabilities).filter(([, v]) => v).map(([k]) => k)
        }
      ])
    ),
    global_flags: ["--json", "--provider", "--no-cache"],
    auto_json_when_piped: true,
    semantic_exit_codes: {
      "0": "success",
      "1": "api_error",
      "2": "config_error",
      "3": "auth_error",
      "4": "rate_limited",
      "5": "no_results"
    }
  };
  process.stdout.write(JSON.stringify(info, null, 2) + "\n");
}

// src/commands/config-cmd.ts
var PROVIDERS = ["jina", "exa", "firecrawl", "grok"];
function configShowCommand() {
  const config = loadConfig();
  console.log(`Config file: ${getConfigFile()}
`);
  console.log("[keys]");
  for (const p of PROVIDERS) {
    const key = resolveKey(p);
    const masked = key ? key.slice(0, 8) + "..." + key.slice(-4) : "(not set)";
    const source = config.keys[p] ? "config" : key ? "env" : "";
    console.log(`  ${p.padEnd(12)} ${masked}${source ? `  (from ${source})` : ""}`);
  }
  console.log("\n[defaults]");
  console.log(`  num_results  ${config.defaults.num_results}`);
  console.log(`  timeout      ${config.defaults.timeout}ms`);
  console.log(`  provider     ${config.defaults.provider || "(auto)"}`);
  console.log("\n[cache]");
  console.log(`  enabled      ${config.cache.enabled}`);
  console.log(`  ttl          ${config.cache.ttl}s`);
}
function configCheckCommand() {
  console.log("Provider Health Check\n");
  for (const p of PROVIDERS) {
    const configured = isProviderConfigured(p);
    const icon = configured ? "\x1B[32m\u2713\x1B[0m" : "\x1B[31m\u2717\x1B[0m";
    const status = configured ? "configured" : "not configured";
    console.log(`  ${icon} ${p.padEnd(12)} ${status}`);
  }
  const anyConfigured = PROVIDERS.some((p) => isProviderConfigured(p));
  if (!anyConfigured) {
    console.log("\n\x1B[33mNo providers configured.\x1B[0m");
    console.log("Set API keys via env vars or: wit config set keys.<provider> <key>");
    console.log("  JINA_API_KEY, EXA_API_KEY, FIRECRAWL_API_KEY, XAI_API_KEY");
  }
}
function configSetCommand(key, value) {
  setConfigValue(key, value);
  console.log(`Set ${key} = ${value.slice(0, 8)}...`);
}

// src/index.ts
var program = new Command();
program.name("wit").description("Web Intelligence Toolkit \u2014 unified CLI for Jina, Exa, Firecrawl, and Grok").version("0.1.0");
program.command("search").description("Smart-routed web search").argument("<query>", "Search query").option("-n, --num <count>", "Number of results", "10").option("-p, --provider <name>", "Force specific provider").option("--news", "Search news only").option("--academic", "Search academic papers").option("--social", "Search X/Twitter").option("--domain <domains>", "Include only these domains (comma-separated)").option("--exclude <domains>", "Exclude these domains (comma-separated)").option("--since <period>", "Results after period (1h, 1d, 1w, 1m, 1y or ISO date)").option("--json", "Force JSON output").action(async (query, opts) => {
  await searchCommand(query, { ...opts, num: parseInt(opts.num, 10) });
});
program.command("read").description("Read URL and convert to markdown").argument("[url]", "URL to read (or pipe URLs via stdin)").option("--links", "Include hyperlinks in output").option("--images", "Include images in output").option("--selector <css>", "Target specific DOM element").option("--wait <ms>", "Wait for JS rendering (ms)").option("-p, --provider <name>", "Force specific provider").option("--json", "Force JSON output").action(async (url, opts) => {
  await readCommand(url, { ...opts, wait: opts.wait ? parseInt(opts.wait, 10) : void 0 });
});
program.command("agent-info").description("Machine-readable capability discovery").action(() => {
  agentInfoCommand();
});
var configCmd = program.command("config").description("Manage configuration");
configCmd.command("show").description("Show current configuration").action(() => configShowCommand());
configCmd.command("check").description("Health check \u2014 which providers are configured").action(() => configCheckCommand());
configCmd.command("set").description("Set a config value").argument("<key>", "Config key (e.g., keys.jina)").argument("<value>", "Config value").action((key, value) => configSetCommand(key, value));
process.on("uncaughtException", (err) => {
  if (!process.stdout.isTTY) {
    process.stdout.write(JSON.stringify({
      version: "1",
      status: "error",
      command: "unknown",
      data: null,
      metadata: { elapsed_ms: 0, providers_used: [], providers_failed: [], cached: false },
      error: { code: "internal", message: err.message, suggestion: "" }
    }) + "\n");
  } else {
    process.stderr.write(`\x1B[31mError:\x1B[0m ${err.message}
`);
  }
  process.exit(1 /* ApiError */);
});
program.parse();
