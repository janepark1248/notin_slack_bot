export interface CachedNotionPage {
  id: string;
  title: string;
  url: string;
  content: string;
  lastSyncedAt: string;
}

export interface NotionCache {
  pages: CachedNotionPage[];
  lastSyncedAt: string;
}

export interface SearchResult {
  page: CachedNotionPage;
  score: number;
  snippet: string;
}
