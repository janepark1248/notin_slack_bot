import type { CachedNotionPage, SearchResult } from "../types";

const STOP_WORDS = new Set([
  "이", "가", "을", "를", "의", "에", "에서", "로", "으로", "와", "과",
  "은", "는", "도", "만", "까지", "부터", "에게", "한테", "께",
  "the", "a", "an", "is", "are", "was", "were", "be", "been",
  "in", "on", "at", "to", "for", "of", "with", "and", "or", "not",
  "it", "this", "that", "what", "how", "when", "where", "who",
]);

const MAX_RESULTS = 5;
const TITLE_WEIGHT = 3;
const EXACT_PHRASE_BONUS = 5;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function extractSnippet(content: string, tokens: string[]): string {
  const lower = content.toLowerCase();
  let bestPos = 0;
  let bestScore = 0;

  for (let i = 0; i < lower.length; i += 50) {
    const window = lower.slice(i, i + 200);
    const score = tokens.filter((t) => window.includes(t)).length;
    if (score > bestScore) {
      bestScore = score;
      bestPos = i;
    }
  }

  const start = Math.max(0, bestPos - 20);
  const end = Math.min(content.length, bestPos + 200);
  let snippet = content.slice(start, end).replace(/\n/g, " ").trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";
  return snippet;
}

export function searchPages(
  query: string,
  pages: CachedNotionPage[]
): SearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const queryLower = query.toLowerCase();

  const scored: SearchResult[] = pages.map((page) => {
    const titleLower = page.title.toLowerCase();
    const contentLower = page.content.toLowerCase();

    let score = 0;

    // Term frequency scoring
    for (const token of tokens) {
      // Title matches (weighted)
      if (titleLower.includes(token)) {
        score += TITLE_WEIGHT;
      }
      // Content matches
      const matches = contentLower.split(token).length - 1;
      score += Math.min(matches, 10); // cap per-term contribution
    }

    // Exact phrase bonus
    if (queryLower.length > 3 && contentLower.includes(queryLower)) {
      score += EXACT_PHRASE_BONUS;
    }
    if (queryLower.length > 3 && titleLower.includes(queryLower)) {
      score += EXACT_PHRASE_BONUS * 2;
    }

    const snippet = score > 0 ? extractSnippet(page.content, tokens) : "";

    return { page, score, snippet };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS);
}
