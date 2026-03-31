export type Intent = 'social' | 'news' | 'academic' | 'people' | 'company' | 'extract' | 'similar' | 'general';

interface IntentRule {
  intent: Intent;
  weight: number;
  patterns: RegExp[];
}

const INTENT_RULES: IntentRule[] = [
  {
    intent: 'social',
    weight: 10,
    patterns: [/tweet[s]?/i, /on twitter/i, /on x\b/i, /x\.com/i, /twitter\.com/i, /@\w+/],
  },
  {
    intent: 'similar',
    weight: 9,
    patterns: [/similar to/i, /like this/i, /related to/i, /find similar/i],
  },
  {
    intent: 'academic',
    weight: 8,
    patterns: [/\bpaper[s]?\b/i, /\barxiv\b/i, /research paper/i, /\bjournal\b/i, /\bpubmed\b/i, /\bdoi\b/i, /\bssrn\b/i, /\bthesis\b/i],
  },
  {
    intent: 'people',
    weight: 7,
    patterns: [/who is/i, /\blinkedin\b/i, /profile of/i, /\bfounder\b/i, /\bceo\b/i, /\bcto\b/i],
  },
  {
    intent: 'extract',
    weight: 7,
    patterns: [/\bextract\b/i, /\bscrape\b/i, /get data/i, /structured data/i],
  },
  {
    intent: 'company',
    weight: 6,
    patterns: [/\bcompany\b/i, /\bstartup\b/i, /\bfunding\b/i, /\brevenue\b/i, /\bheadcount\b/i, /\bvaluation\b/i],
  },
  {
    intent: 'news',
    weight: 5,
    patterns: [/\blatest\b/i, /\bbreaking\b/i, /\bnews\b/i, /\btoday\b/i, /this week/i, /\bheadlines\b/i, /\bannounced\b/i],
  },
];

export function classifyIntent(query: string): Intent {
  let bestIntent: Intent = 'general';
  let bestScore = 0;

  for (const rule of INTENT_RULES) {
    let score = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(query)) {
        score += rule.weight;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestIntent = rule.intent;
    }
  }

  return bestIntent;
}

// Returns ordered list of provider names for a given intent
export function routeSearch(intent: Intent): string[] {
  switch (intent) {
    case 'social':
      return ['grok'];
    case 'news':
      return ['exa', 'jina'];
    case 'academic':
      return ['jina'];
    case 'people':
      return ['exa'];
    case 'company':
      return ['exa'];
    case 'similar':
      return ['exa'];
    case 'extract':
      return ['exa', 'jina'];
    case 'general':
    default:
      return ['exa', 'jina', 'firecrawl'];
  }
}
