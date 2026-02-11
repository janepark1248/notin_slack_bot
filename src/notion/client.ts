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

async function getPageTitle(pageId: string): Promise<string> {
  const page = await notion.pages.retrieve({ page_id: pageId });
  if (!("properties" in page)) return "Untitled";

  const titleProp = Object.values(page.properties).find(
    (p) => p.type === "title"
  );
  if (titleProp && titleProp.type === "title" && titleProp.title.length > 0) {
    return titleProp.title.map((t) => t.plain_text).join("");
  }
  return "Untitled";
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

async function getChildPages(parentId: string): Promise<string[]> {
  const blocks = await getPageBlocks(parentId);
  const childPageIds: string[] = [];

  for (const b of blocks) {
    if (b.type === "child_page") {
      childPageIds.push(b.id);
    } else if (b.has_children && ["column_list", "column", "callout", "toggle", "bulleted_list_item", "numbered_list_item", "quote", "synced_block"].includes(b.type)) {
      await delay(RATE_LIMIT_DELAY);
      const nested = await getChildPages(b.id);
      childPageIds.push(...nested);
    }
  }

  return childPageIds;
}

async function crawlPage(pageId: string): Promise<CachedNotionPage> {
  const [title, blocks] = await Promise.all([
    getPageTitle(pageId),
    getPageBlocks(pageId),
  ]);

  const content = parseBlocks(blocks);

  return {
    id: pageId,
    title,
    url: getPageUrl(pageId),
    content,
    lastSyncedAt: new Date().toISOString(),
  };
}

export async function crawlAllPages(
  rootPageId: string
): Promise<CachedNotionPage[]> {
  const pages: CachedNotionPage[] = [];
  const visited = new Set<string>();

  async function visit(pageId: string): Promise<void> {
    if (visited.has(pageId)) return;
    visited.add(pageId);

    const page = await crawlPage(pageId);
    pages.push(page);

    const childIds = await getChildPages(pageId);
    for (const childId of childIds) {
      await delay(RATE_LIMIT_DELAY);
      await visit(childId);
    }
  }

  await visit(rootPageId);
  return pages;
}
