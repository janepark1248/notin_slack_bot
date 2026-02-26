export interface CachedNotionPage {
  id: string;
  title: string;
  url: string;
  content: string;
  lastSyncedAt: string;
  lastEditedAt: string;   // 추가: Notion의 last_edited_time
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
