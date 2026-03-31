const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid',
  '_ga', '_gl', 'yclid', 'spm',
]);

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Normalize protocol
    u.protocol = 'https:';
    // Remove www
    u.hostname = u.hostname.replace(/^www\./, '');
    // Remove tracking params
    for (const param of TRACKING_PARAMS) {
      u.searchParams.delete(param);
    }
    // Sort remaining query params
    u.searchParams.sort();
    // Remove trailing slash
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    // Remove fragment
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, '');
  }
}

export function dedup(results: Array<{ url: string }>): Array<{ url: string }> {
  const seen = new Set<string>();
  return results.filter(r => {
    const norm = normalizeUrl(r.url);
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
}
