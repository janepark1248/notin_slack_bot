import { Client } from "@notionhq/client";
import { config } from "../config";
import { parseBlocks } from "./parser";
import type { CachedNotionPage } from "../types";

const notion = new Client({ auth: config.notion.token });

const RATE_LIMIT_DELAY = 350;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPageUrl(pageId: string): string {
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`;
}

async function getPageMeta(
  pageId: string
): Promise<{ title: string; lastEditedTime: string }> {
  const page = await notion.pages.retrieve({ page_id: pageId });
  if (!("properties" in page)) {
    return { title: "Untitled", lastEditedTime: "" };
  }

  let title = "Untitled";
  const titleProp = Object.values(page.properties).find(
    (p) => p.type === "title"
  );
  if (titleProp && titleProp.type === "title" && titleProp.title.length > 0) {
    title = titleProp.title.map((t) => t.plain_text).join("");
  }

  const lastEditedTime =
    "last_edited_time" in page ? (page.last_edited_time as string) : "";

  return { title, lastEditedTime };
}

async function getPageBlocks(pageId: string): Promise<any[]> {
  const blocks: any[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor! : undefined;
    await delay(RATE_LIMIT_DELAY);
  } while (cursor);

  return blocks;
}

async function extractChildPageIds(blocks: any[]): Promise<string[]> {
  const ids: string[] = [];
  const nestedTypes = [
    "column_list",
    "column",
    "callout",
    "toggle",
    "bulleted_list_item",
    "numbered_list_item",
    "quote",
    "synced_block",
  ];

  for (const b of blocks) {
    if (b.type === "child_page") {
      ids.push(b.id);
    } else if (b.has_children && nestedTypes.includes(b.type)) {
      await delay(RATE_LIMIT_DELAY);
      const nested = await getPageBlocks(b.id);
      const nestedIds = await extractChildPageIds(nested);
      ids.push(...nestedIds);
    }
  }
  return ids;
}

export async function crawlAllPages(
  rootPageId: string,
  existingCache: Map<string, CachedNotionPage> = new Map()
): Promise<CachedNotionPage[]> {
  const pages: CachedNotionPage[] = [];
  const visited = new Set<string>();

  async function visit(pageId: string): Promise<void> {
    if (visited.has(pageId)) return;
    visited.add(pageId);

    const { title, lastEditedTime } = await getPageMeta(pageId);

    if (title.includes("이전")) {
      console.log(`[client] Skipping page with "이전" in title: "${title}"`);
      return;
    }

    const cached = existingCache.get(pageId);

    if (cached && cached.lastEditedAt === lastEditedTime) {
      // Cache hit: content unchanged, use cached content but still traverse children
      // because a grandchild content change only updates that grandchild's last_edited_time,
      // not the parent's, so we must recurse to avoid missing deep content changes.
      pages.push({
        id: pageId,
        title,
        url: getPageUrl(pageId),
        content: cached.content,
        lastSyncedAt: new Date().toISOString(),
        lastEditedAt: lastEditedTime,
      });
      const cachedBlocks = await getPageBlocks(pageId);
      const cachedChildIds = await extractChildPageIds(cachedBlocks);
      for (const childId of cachedChildIds) {
        await visit(childId);
      }
      return;
    }

    // Cache miss or changed: fetch blocks once for both content and child discovery
    const blocks = await getPageBlocks(pageId);
    const content = parseBlocks(blocks);
    const childIds = await extractChildPageIds(blocks);

    pages.push({
      id: pageId,
      title,
      url: getPageUrl(pageId),
      content,
      lastSyncedAt: new Date().toISOString(),
      lastEditedAt: lastEditedTime,
    });

    for (const childId of childIds) {
      await visit(childId);
    }
  }

  await visit(rootPageId);
  return pages;
}
