import { buildProviders } from '../providers/index.js';
import { detectFormat, output, buildResponse, buildErrorResponse } from '../output/index.js';
import { ExitCode } from '../errors/index.js';
import { request } from '../utils/http.js';
import { resolveKey } from '../config/index.js';

const EXA_BASE = 'https://api.exa.ai';

interface CompanyFlags {
  json?: boolean;
}

interface ExaSearchResponse {
  results: Array<{
    title: string;
    url: string;
    publishedDate?: string;
    score?: number;
    highlights?: string[];
    text?: string;
  }>;
}

interface ExaContentsResponse {
  results: Array<{
    title: string;
    url: string;
    summary?: string;
    text?: string;
  }>;
}

export async function companyCommand(url: string, flags: CompanyFlags): Promise<void> {
  const startTime = Date.now();
  const format = detectFormat(flags.json);

  const providers = buildProviders();
  const exa = providers.find(p => p.name === 'exa' && p.isConfigured());

  if (!exa) {
    const resp = buildErrorResponse('company', {
      code: 'no_providers',
      message: 'Exa provider not configured',
      suggestion: 'Set EXA_API_KEY. Run: wit config check',
    }, startTime);
    output(resp, format);
    process.exitCode = ExitCode.ConfigError;
    return;
  }

  // Extract domain from URL
  let domain = url;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    domain = parsed.hostname.replace(/^www\./, '');
  } catch {
    domain = url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  }

  const key = resolveKey('exa');
  const headers = {
    'x-api-key': key,
    Accept: 'application/json',
  };

  const canonicalUrl = url.startsWith('http') ? url : `https://${domain}`;

  const providersUsed: string[] = [];
  const providersFailed: string[] = [];

  // Fire 8 parallel searches
  const [
    homepage,
    linkedin,
    funding,
    news,
    github,
    twitter,
    crunchbase,
    competitors,
  ] = await Promise.allSettled([
    // 1. Get homepage contents with summary
    request<ExaContentsResponse>(`${EXA_BASE}/contents`, {
      method: 'POST',
      headers,
      body: {
        urls: [canonicalUrl],
        summary: { query: `What does ${domain} do?` },
        text: { maxCharacters: 1000 },
      },
      provider: 'exa',
      timeout: 30000,
    }),
    // 2. LinkedIn
    request<ExaSearchResponse>(`${EXA_BASE}/search`, {
      method: 'POST',
      headers,
      body: {
        query: `${domain} linkedin`,
        numResults: 3,
        includeDomains: ['linkedin.com'],
        contents: { highlights: true, text: { maxCharacters: 300 } },
      },
      provider: 'exa',
      timeout: 30000,
    }),
    // 3. Funding
    request<ExaSearchResponse>(`${EXA_BASE}/search`, {
      method: 'POST',
      headers,
      body: {
        query: `${domain} funding raised investment`,
        numResults: 3,
        includeText: [domain],
        contents: { highlights: true, text: { maxCharacters: 300 } },
      },
      provider: 'exa',
      timeout: 30000,
    }),
    // 4. News
    request<ExaSearchResponse>(`${EXA_BASE}/search`, {
      method: 'POST',
      headers,
      body: {
        query: `${domain} news`,
        numResults: 5,
        category: 'news',
        contents: { highlights: true, text: { maxCharacters: 300 } },
      },
      provider: 'exa',
      timeout: 30000,
    }),
    // 5. GitHub
    request<ExaSearchResponse>(`${EXA_BASE}/search`, {
      method: 'POST',
      headers,
      body: {
        query: `${domain} github`,
        numResults: 3,
        includeDomains: ['github.com'],
        contents: { highlights: true, text: { maxCharacters: 300 } },
      },
      provider: 'exa',
      timeout: 30000,
    }),
    // 6. Twitter/X
    request<ExaSearchResponse>(`${EXA_BASE}/search`, {
      method: 'POST',
      headers,
      body: {
        query: `${domain} twitter`,
        numResults: 3,
        includeDomains: ['x.com', 'twitter.com'],
        contents: { highlights: true, text: { maxCharacters: 300 } },
      },
      provider: 'exa',
      timeout: 30000,
    }),
    // 7. Crunchbase
    request<ExaSearchResponse>(`${EXA_BASE}/search`, {
      method: 'POST',
      headers,
      body: {
        query: `${domain} crunchbase`,
        numResults: 2,
        includeDomains: ['crunchbase.com'],
        contents: { highlights: true, text: { maxCharacters: 300 } },
      },
      provider: 'exa',
      timeout: 30000,
    }),
    // 8. Competitors
    request<ExaSearchResponse>(`${EXA_BASE}/search`, {
      method: 'POST',
      headers,
      body: {
        query: `${domain} competitors alternatives`,
        numResults: 5,
        excludeDomains: [domain],
        contents: { highlights: true, text: { maxCharacters: 300 } },
      },
      provider: 'exa',
      timeout: 30000,
    }),
  ]);

  // Check if any succeeded
  const anySuccess = [homepage, linkedin, funding, news, github, twitter, crunchbase, competitors]
    .some(r => r.status === 'fulfilled');

  if (anySuccess) {
    providersUsed.push('exa');
  } else {
    providersFailed.push('exa');
  }

  function extractSearchResults(settled: PromiseSettledResult<ExaSearchResponse>) {
    if (settled.status === 'rejected') return [];
    return (settled.value.results ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.highlights?.[0] ?? r.text?.slice(0, 200) ?? '',
      published: r.publishedDate,
      score: r.score,
    }));
  }

  const homepageData = homepage.status === 'fulfilled'
    ? homepage.value.results?.[0]
    : null;

  const profile = {
    domain,
    url: canonicalUrl,
    overview: {
      title: homepageData?.title ?? '',
      summary: (homepageData as { summary?: string } | null)?.summary ?? '',
      description: homepageData?.text?.slice(0, 500) ?? '',
    },
    social: {
      linkedin: extractSearchResults(linkedin as PromiseSettledResult<ExaSearchResponse>),
      twitter: extractSearchResults(twitter as PromiseSettledResult<ExaSearchResponse>),
      github: extractSearchResults(github as PromiseSettledResult<ExaSearchResponse>),
    },
    funding: extractSearchResults(funding as PromiseSettledResult<ExaSearchResponse>),
    news: extractSearchResults(news as PromiseSettledResult<ExaSearchResponse>),
    crunchbase: extractSearchResults(crunchbase as PromiseSettledResult<ExaSearchResponse>),
    competitors: extractSearchResults(competitors as PromiseSettledResult<ExaSearchResponse>),
  };

  const resp = buildResponse('company', profile, {
    query: url,
    startTime,
    providersUsed,
    providersFailed,
  });

  output(resp, format);
  if (resp.status === 'error' || resp.status === 'all_providers_failed') {
    process.exitCode = ExitCode.ApiError;
  }
}
