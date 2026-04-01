import type { Provider, ProviderCapabilities } from './index.js';
import type { SearchResult, SearchOpts, TaskType } from '../types/index.js';
import { request } from '../utils/http.js';
import { cleanSnippet } from '../utils/format.js';

const BASE_URL = 'https://api.x.ai/v1';

interface GrokResponseContent {
  type: string;
  text?: string;
  annotations?: Array<{
    type: string;
    url_citation?: {
      url: string;
      title: string;
    };
  }>;
}

interface GrokResponseOutput {
  type: string;
  content?: GrokResponseContent[];
}

interface GrokResponse {
  output?: GrokResponseOutput[];
}

export class GrokProvider implements Provider {
  readonly name = 'grok';
  readonly capabilities: ProviderCapabilities = {
    search: true,
    searchSocial: true,
  };

  constructor(private getKey: () => string) {}

  isConfigured(): boolean {
    return this.getKey().length > 0;
  }

  timeout(_task: TaskType): number {
    return 90000;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.getKey()}`,
      Accept: 'application/json',
    };
  }

  private parseGrokResponse(res: GrokResponse): { text: string; citations: Array<{ url: string; title: string }> } {
    const citations: Array<{ url: string; title: string }> = [];
    let text = '';

    for (const output of res.output ?? []) {
      for (const content of output.content ?? []) {
        if (content.type === 'text' && content.text) {
          text += content.text;
        }
        for (const annotation of content.annotations ?? []) {
          if (annotation.type === 'url_citation' && annotation.url_citation) {
            citations.push({
              url: annotation.url_citation.url,
              title: annotation.url_citation.title,
            });
          }
        }
      }
    }

    return { text, citations };
  }

  async search(query: string, _opts: SearchOpts = {}): Promise<SearchResult[]> {
    const res = await request<GrokResponse>(`${BASE_URL}/responses`, {
      method: 'POST',
      headers: this.headers(),
      body: {
        model: 'grok-4-1-fast',
        tools: [{ type: 'web_search' }],
        input: query,
      },
      provider: 'grok',
      timeout: this.timeout('search'),
    });

    const { text, citations } = this.parseGrokResponse(res);

    const results: SearchResult[] = citations.map(c => ({
      title: c.title,
      url: c.url,
      snippet: '',
      source: 'grok',
    }));

    if (text) {
      if (results.length > 0) {
        results[0] = { ...results[0], content: text, snippet: cleanSnippet(text) };
      } else {
        results.push({
          title: 'Grok response',
          url: '',
          snippet: cleanSnippet(text),
          content: text,
          source: 'grok',
        });
      }
    }

    return results;
  }

  async searchSocial(query: string, opts: SearchOpts = {}): Promise<SearchResult[]> {
    const xSearchConfig: Record<string, unknown> = {};
    if (opts.from) xSearchConfig.allowed_x_handles = [opts.from];

    const dateRange: Record<string, string> = {};
    if (opts.since) dateRange.start = opts.since;
    if (opts.until) dateRange.end = opts.until;
    if (Object.keys(dateRange).length > 0) xSearchConfig.date_range = dateRange;

    const res = await request<GrokResponse>(`${BASE_URL}/responses`, {
      method: 'POST',
      headers: this.headers(),
      body: {
        model: 'grok-4-1-fast',
        tools: [{
          type: 'x_search',
          ...(Object.keys(xSearchConfig).length > 0 ? { x_search: xSearchConfig } : {}),
        }],
        input: query,
      },
      provider: 'grok',
      timeout: this.timeout('search_social'),
    });

    const { text, citations } = this.parseGrokResponse(res);

    const results: SearchResult[] = citations.map(c => ({
      title: c.title,
      url: c.url,
      snippet: '',
      source: 'grok',
    }));

    if (text) {
      if (results.length > 0) {
        results[0] = { ...results[0], content: text, snippet: cleanSnippet(text) };
      } else {
        results.push({
          title: 'Grok response',
          url: '',
          snippet: cleanSnippet(text),
          content: text,
          source: 'grok',
        });
      }
    }

    return results;
  }
}
