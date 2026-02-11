import * as fs from "fs";
import * as path from "path";
import { crawlAllPages } from "./client";
import { config } from "../config";
import type { CachedNotionPage, NotionCache } from "../types";

const CACHE_FILE = path.join(process.cwd(), "data", "notion-cache.json");

let cachedPages: CachedNotionPage[] = [];
let syncTimer: ReturnType<typeof setInterval> | null = null;

export function getPages(): CachedNotionPage[] {
  return cachedPages;
}

function loadFromFile(): boolean {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, "utf-8");
      const data: NotionCache = JSON.parse(raw);
      cachedPages = data.pages;
      console.log(
        `[cache] Loaded ${cachedPages.length} pages from file (synced: ${data.lastSyncedAt})`
      );
      return true;
    }
  } catch (err) {
    console.error("[cache] Failed to load cache file:", err);
  }
  return false;
}

function saveToFile(): void {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data: NotionCache = {
      pages: cachedPages,
      lastSyncedAt: new Date().toISOString(),
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");
    console.log(`[cache] Saved ${cachedPages.length} pages to file`);
  } catch (err) {
    console.error("[cache] Failed to save cache file:", err);
  }
}

export async function syncNow(): Promise<number> {
  console.log("[cache] Starting Notion sync...");
  const pages = await crawlAllPages(config.notion.rootPageId);
  cachedPages = pages;
  saveToFile();
  console.log(`[cache] Sync complete: ${pages.length} pages cached`);
  return pages.length;
}

export function initCache(): void {
  loadFromFile();
}

export function startPeriodicSync(): void {
  // Run first sync immediately
  syncNow().catch((err) => console.error("[cache] Initial sync failed:", err));

  // Schedule periodic syncs
  syncTimer = setInterval(() => {
    syncNow().catch((err) =>
      console.error("[cache] Periodic sync failed:", err)
    );
  }, config.syncIntervalMs);

  console.log(
    `[cache] Periodic sync scheduled every ${Math.round(config.syncIntervalMs / (24 * 60 * 60 * 1000))} days`
  );
}

export function stopPeriodicSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
