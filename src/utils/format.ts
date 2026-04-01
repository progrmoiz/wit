/**
 * Clean a snippet for display — strip \n, collapse whitespace,
 * remove markdown artifacts, trim to maxLen chars
 */
export function cleanSnippet(text: string, maxLen = 200): string {
  const cleaned = text
    .replace(/\n+/g, ' ')                          // Replace newlines with spaces
    .replace(/\s+/g, ' ')                          // Collapse whitespace
    .replace(/[#*_~`>|]/g, '')                     // Strip markdown formatting chars
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')       // [text](url) → text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')        // Remove images
    .trim();

  return cleaned.slice(0, maxLen) + (cleaned.length > maxLen ? '...' : '');
}

/**
 * Format a date string to YYYY-MM-DD or relative ("2 days ago")
 */
export function formatDate(date?: string | null): string | undefined {
  if (!date) return undefined;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;

    // For older dates, return YYYY-MM-DD
    return d.toISOString().split('T')[0];
  } catch {
    return date;
  }
}
