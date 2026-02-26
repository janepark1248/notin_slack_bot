import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CachedNotionPage } from "../../types";

// @notionhq/client 모킹
const { mockRetrieve, mockList } = vi.hoisted(() => ({
  mockRetrieve: vi.fn(),
  mockList: vi.fn(),
}));

vi.mock("@notionhq/client", () => {
  return {
    Client: vi.fn(function () {
      return {
        pages: { retrieve: mockRetrieve },
        blocks: { children: { list: mockList } },
      };
    }),
  };
});

// config 모킹
vi.mock("../../config", () => ({
  config: { notion: { token: "test-token", rootPageId: "root-id" } },
}));

import { crawlAllPages } from "../../notion/client";

function getNotionMocks() {
  return {
    retrieve: mockRetrieve,
    list: mockList,
  };
}

function makePageResponse(id: string, title: string, lastEditedTime: string) {
  return {
    id,
    last_edited_time: lastEditedTime,
    properties: {
      title: {
        type: "title",
        title: [{ plain_text: title }],
      },
    },
  };
}

function makeBlocksResponse(childPageIds: string[] = []) {
  return {
    results: [
      { type: "paragraph", paragraph: { rich_text: [{ plain_text: "내용" }] } },
      ...childPageIds.map((id) => ({ type: "child_page", id, child_page: { title: "" } })),
    ],
    has_more: false,
    next_cursor: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("crawlAllPages", () => {
  it("캐시에 없는 페이지는 블록을 fetch해 내용을 파싱한다", async () => {
    const { retrieve, list } = getNotionMocks();
    retrieve.mockResolvedValue(makePageResponse("root-id", "루트", "2024-01-02T00:00:00.000Z"));
    list.mockResolvedValue(makeBlocksResponse([]));

    const result = await crawlAllPages("root-id");

    expect(list).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("내용");
    expect(result[0].lastEditedAt).toBe("2024-01-02T00:00:00.000Z");
  });

  it("캐시와 last_edited_time이 동일하면 블록 fetch를 건너뛰고 캐시 내용을 사용한다", async () => {
    const { retrieve, list } = getNotionMocks();
    const lastEdited = "2024-01-01T00:00:00.000Z";
    retrieve.mockResolvedValue(makePageResponse("root-id", "루트", lastEdited));

    const existingCache = new Map<string, CachedNotionPage>([
      [
        "root-id",
        {
          id: "root-id",
          title: "루트",
          url: "https://www.notion.so/rootid",
          content: "캐시된 내용",
          lastSyncedAt: "2024-01-01T00:00:00.000Z",
          lastEditedAt: lastEdited,
        },
      ],
    ]);

    const result = await crawlAllPages("root-id", existingCache);

    expect(list).not.toHaveBeenCalled();
    expect(result[0].content).toBe("캐시된 내용");
  });

  it("제목에 '이전'이 포함된 페이지와 그 자식은 결과에 포함되지 않는다", async () => {
    const { retrieve, list } = getNotionMocks();
    retrieve
      .mockResolvedValueOnce(makePageResponse("root-id", "루트", "2024-01-02T00:00:00.000Z"))
      .mockResolvedValueOnce(makePageResponse("old-id", "이전 기록", "2024-01-02T00:00:00.000Z"));
    list.mockResolvedValueOnce(makeBlocksResponse(["old-id"]));

    const result = await crawlAllPages("root-id");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("root-id");
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("자식 페이지도 재귀적으로 크롤링한다", async () => {
    const { retrieve, list } = getNotionMocks();
    retrieve
      .mockResolvedValueOnce(makePageResponse("root-id", "루트", "2024-01-02T00:00:00.000Z"))
      .mockResolvedValueOnce(makePageResponse("child-id", "자식", "2024-01-02T00:00:00.000Z"));
    list
      .mockResolvedValueOnce(makeBlocksResponse(["child-id"]))
      .mockResolvedValueOnce(makeBlocksResponse([]));

    const result = await crawlAllPages("root-id");

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id)).toContain("child-id");
  });

  it("캐시에 있던 페이지가 트리에서 사라지면 결과에서 제거된다", async () => {
    const { retrieve, list } = getNotionMocks();
    retrieve.mockResolvedValue(makePageResponse("root-id", "루트", "2024-01-02T00:00:00.000Z"));
    list.mockResolvedValue(makeBlocksResponse([]));

    const existingCache = new Map<string, CachedNotionPage>([
      [
        "deleted-id",
        {
          id: "deleted-id",
          title: "삭제된 페이지",
          url: "https://www.notion.so/deletedid",
          content: "내용",
          lastSyncedAt: "2024-01-01T00:00:00.000Z",
          lastEditedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    ]);

    const result = await crawlAllPages("root-id", existingCache);

    expect(result.find((p) => p.id === "deleted-id")).toBeUndefined();
  });
});
