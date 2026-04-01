export type TaskType =
  | 'search' | 'search_news' | 'search_academic' | 'search_social'
  | 'read' | 'extract' | 'screenshot' | 'crawl' | 'map'
  | 'similar' | 'answer' | 'research' | 'monitor'
  | 'embed' | 'rerank' | 'classify' | 'dedup'
  | 'brand' | 'pdf' | 'download' | 'grep' | 'company';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;           // Clean, short (200 chars max, no \n, for display)
  content?: string;          // Full page content/markdown (when available)
  highlights?: string[];     // All relevant highlights (Exa)
  source: string;
  published?: string;        // Clean date: YYYY-MM-DD (not full ISO timestamp)
  author?: string;
  score?: number;
  image_url?: string;
  extra?: Record<string, unknown>;
}

export interface ReadResult {
  url: string;
  title: string;
  description?: string;
  content: string;
  published?: string;
  word_count: number;
  links?: string[];
  images?: string[];
  source: string;
}

export interface ExtractResult {
  url: string;
  title?: string;
  description?: string;
  data: Record<string, unknown>;
  source: string;
}

export interface ScreenshotResult {
  url: string;
  image_url?: string;
  image_base64?: string;
  source: string;
}

export interface AnswerResult {
  answer: string;
  citations: { url: string; title: string }[];
  source: string;
}

export interface EmbedResult {
  embeddings: number[][];
  model: string;
  source: string;
  usage?: { total_tokens: number };
}

export interface RerankResult {
  results: { index: number; score: number; text: string }[];
  source: string;
}

export interface ClassifyResult {
  classifications: { text: string; label: string; score: number }[];
  source: string;
}

export interface DedupResult {
  unique: string[];
  removed: number;
  source: string;
}

export interface BrandResult {
  url: string;
  data: Record<string, unknown>;
  source: string;
}

export interface WitResponse<T = unknown> {
  version: '1';
  status: 'success' | 'partial_success' | 'all_providers_failed' | 'no_results' | 'error';
  command: string;
  query?: string;
  data: T | null;
  metadata: {
    elapsed_ms: number;
    providers_used: string[];
    providers_failed: string[];
    cost_usd?: number;
    cached: boolean;
    result_count?: number;
    provider_errors?: Record<string, string>;
  };
  error?: {
    code: string;
    message: string;
    suggestion: string;
    provider?: string;
  };
}

export interface SearchOpts {
  num?: number;
  domains?: string[];
  excludeDomains?: string[];
  since?: string;
  until?: string;
  from?: string;
  tbs?: string;
  category?: string;
}

export interface ReadOpts {
  links?: boolean;
  images?: boolean;
  selector?: string;
  wait?: number;
}

export interface EmbedOpts {
  model?: string;
  task?: string;
  dimensions?: number;
  local?: boolean;
}

export interface RerankOpts {
  topN?: number;
  local?: boolean;
}

export interface ClassifyOpts {
  local?: boolean;
}

export interface DedupOpts {
  k?: number;
  local?: boolean;
}

export interface PdfOpts {
  type?: string;
  maxEdge?: number;
}
