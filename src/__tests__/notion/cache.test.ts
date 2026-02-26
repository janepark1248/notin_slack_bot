import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../notion/client", () => ({
  crawlAllPages: vi.fn(),
}));

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { crawlAllPages } from "../../notion/client";
import { syncNow, getPages } from "../../notion/cache";
import type { CachedNotionPage } from "../../types";

const mockPage = (id: string): CachedNotionPage => ({
  id,
  title: `Page ${id}`,
  url: `https://notion.so/${id}`,
  content: "내용",
  lastSyncedAt: "2024-01-01T00:00:00.000Z",
  lastEditedAt: "2024-01-01T00:00:00.000Z",
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncNow", () => {
  it("기존 캐시를 Map으로 변환해 crawlAllPages에 전달한다", async () => {
    const newPages = [mockPage("page-1")];
    (crawlAllPages as any).mockResolvedValue(newPages);

    await syncNow();

    const [, passedMap] = (crawlAllPages as any).mock.calls[0];
    expect(passedMap).toBeInstanceOf(Map);
  });

  it("syncNow 후 getPages()가 새 페이지를 반환한다", async () => {
    const newPages = [mockPage("page-new")];
    (crawlAllPages as any).mockResolvedValue(newPages);

    await syncNow();

    expect(getPages()).toEqual(newPages);
  });
});
