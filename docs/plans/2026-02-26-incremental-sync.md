# Incremental Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Notion 동기화 시 변경된 페이지만 fetch하고, "이전" 단어가 포함된 페이지와 그 하위는 제외한다.

**Architecture:** `pages.retrieve()`로 `last_edited_time`을 가져와 캐시와 비교하고, 변경된 경우에만 `blocks.children.list`를 호출한다. 단, 현재 `visit()`에서 블록을 두 번 fetch하는 문제를 해결하기 위해 블록을 1회 fetch해 내용 파싱과 자식 탐색에 함께 사용한다. "이전"이 포함된 페이지는 자식 트리 전체를 탐색하지 않는다.

**Tech Stack:** TypeScript, @notionhq/client v2, vitest

---

## Task 1: vitest 테스트 환경 세팅

**Files:**
- Modify: `package.json`

**Step 1: vitest 설치**

```bash
npm install --save-dev vitest @vitest/coverage-v8
```

**Step 2: package.json에 test 스크립트 추가**

`package.json`의 `scripts`에 아래를 추가:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

**Step 3: 빌드 확인**

```bash
npm run build
```

Expected: 에러 없이 성공

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vitest test framework"
```

---

## Task 2: `CachedNotionPage` 타입에 `lastEditedAt` 추가

**Files:**
- Modify: `src/types.ts`

**Step 1: 실패 테스트 작성**

파일 생성: `src/__tests__/types.test.ts`

```ts
import { describe, it, expectTypeOf } from "vitest";
import type { CachedNotionPage } from "../types";

describe("CachedNotionPage", () => {
  it("lastEditedAt 필드가 string 타입이어야 한다", () => {
    expectTypeOf<CachedNotionPage>().toHaveProperty("lastEditedAt").toEqualTypeOf<string>();
  });
});
```

**Step 2: 테스트 실패 확인**

```bash
npm test -- src/__tests__/types.test.ts
```

Expected: FAIL — `lastEditedAt` 타입 오류

**Step 3: `src/types.ts` 수정**

```ts
export interface CachedNotionPage {
  id: string;
  title: string;
  url: string;
  content: string;
  lastSyncedAt: string;
  lastEditedAt: string;   // 추가: Notion의 last_edited_time
}
```

**Step 4: 테스트 통과 확인**

```bash
npm test -- src/__tests__/types.test.ts
```

Expected: PASS

**Step 5: 빌드 확인 (타입 에러 없는지)**

```bash
npm run build
```

Expected: 성공 (기존 코드에서 `lastEditedAt` 미설정 오류가 나면 임시로 `lastEditedAt: ""` 추가)

**Step 6: Commit**

```bash
git add src/types.ts src/__tests__/types.test.ts
git commit -m "feat: add lastEditedAt field to CachedNotionPage"
```

---

## Task 3: `client.ts` 리팩토링 — 증분 동기화 + "이전" 필터

**Files:**
- Modify: `src/notion/client.ts`
- Create: `src/__tests__/notion/client.test.ts`

### 배경 지식

현재 `crawlAllPages`의 `visit()` 함수는 아래처럼 블록을 **두 번** fetch한다:

1. `crawlPage()` 안에서 `getPageBlocks()` → 내용 파싱용
2. `getChildPages()` 안에서 `getPageBlocks()` → 자식 탐색용

리팩토링 후 `visit()` 흐름:

```
1. notion.pages.retrieve(pageId) → title, last_edited_time 획득
2. title에 "이전" 포함 → return (자식 탐색 없음)
3. notion.blocks.children.list(pageId) → blocks 1회 fetch
4. last_edited_time === existingCache.get(pageId)?.lastEditedAt
   → true: content = existingCache.get(pageId).content (캐시 재사용)
   → false: content = parseBlocks(blocks) (새로 파싱)
5. child_page 타입 블록에서 자식 ID 추출 (같은 blocks 사용)
6. 자식 페이지 재귀 visit()
```

`crawlAllPages` 시그니처 변경:

```ts
export async function crawlAllPages(
  rootPageId: string,
  existingCache: Map<string, CachedNotionPage> = new Map()
): Promise<CachedNotionPage[]>
```

### Step 1: 테스트 파일 작성

파일 생성: `src/__tests__/notion/client.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CachedNotionPage } from "../../types";

// @notionhq/client 모킹
vi.mock("@notionhq/client", () => {
  const mockRetrieve = vi.fn();
  const mockList = vi.fn();
  return {
    Client: vi.fn(() => ({
      pages: { retrieve: mockRetrieve },
      blocks: { children: { list: mockList } },
    })),
  };
});

// config 모킹
vi.mock("../../config", () => ({
  config: { notion: { token: "test-token", rootPageId: "root-id" } },
}));

// 테스트에서 모킹된 함수 접근
import { Client } from "@notionhq/client";
import { crawlAllPages } from "../../notion/client";

function getNotionMocks() {
  const instance = (Client as any).mock.results[0].value;
  return {
    retrieve: instance.pages.retrieve,
    list: instance.blocks.children.list,
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
  // Client를 새로 생성하도록 모듈 리셋
  (Client as any).mockClear();
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
    // "이전 기록" 페이지의 blocks.list는 호출되지 않아야 함
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
    list.mockResolvedValue(makeBlocksResponse([])); // 자식 없음

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
```

**Step 2: 테스트 실패 확인**

```bash
npm test -- src/__tests__/notion/client.test.ts
```

Expected: FAIL — `crawlAllPages` 시그니처가 다름, 캐시 로직 없음

**Step 3: `src/notion/client.ts` 전체 교체**

```ts
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

function extractChildPageIds(blocks: any[]): string[] {
  const ids: string[] = [];
  for (const b of blocks) {
    if (b.type === "child_page") {
      ids.push(b.id);
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

    // 1. 페이지 메타 조회 (title + last_edited_time)
    const { title, lastEditedTime } = await getPageMeta(pageId);

    // 2. "이전" 포함된 페이지는 자체 + 자식 전체 스킵
    if (title.includes("이전")) {
      console.log(`[client] Skipping page with "이전" in title: "${title}"`);
      return;
    }

    const cached = existingCache.get(pageId);
    let content: string;
    let childIds: string[];

    if (cached && cached.lastEditedAt === lastEditedTime) {
      // 3a. 변경 없음 → 캐시 내용 재사용, 블록 fetch 없이 캐시된 자식 관계는
      //     알 수 없으므로 블록은 fetch해야 자식을 발견할 수 있음
      //     단, 부모의 last_edited_time이 변하면 자식 구조도 변한 것이므로
      //     변경 없으면 자식도 이전 방문에서 커버됨 → 블록 스킵 불가
      //     (자식 페이지 추가/삭제 시 부모 last_edited_time이 변함)
      content = cached.content;
      await delay(RATE_LIMIT_DELAY);
      const blocks = await getPageBlocks(pageId);
      childIds = extractChildPageIds(blocks);
    } else {
      // 3b. 변경됨 또는 신규 → 블록 fetch 후 파싱
      await delay(RATE_LIMIT_DELAY);
      const blocks = await getPageBlocks(pageId);
      content = parseBlocks(blocks);
      childIds = extractChildPageIds(blocks);
    }

    pages.push({
      id: pageId,
      title,
      url: getPageUrl(pageId),
      content,
      lastSyncedAt: new Date().toISOString(),
      lastEditedAt: lastEditedTime,
    });

    // 4. 자식 페이지 재귀 탐색
    for (const childId of childIds) {
      await visit(childId);
    }
  }

  await visit(rootPageId);
  return pages;
}
```

> **Note:** Notion에서 자식 페이지가 추가/삭제되면 부모의 `last_edited_time`이 변경되므로, 부모가 변경되지 않은 경우에도 블록 fetch는 필요합니다 (자식 ID 목록을 블록에서만 알 수 있음). 단, 블록을 두 번 fetch하던 기존 방식에서 1회로 줄이는 것 자체로 API 호출이 절반으로 줄어듭니다.

**Step 4: 테스트 통과 확인**

```bash
npm test -- src/__tests__/notion/client.test.ts
```

Expected: PASS (4개 테스트)

**Step 5: Commit**

```bash
git add src/notion/client.ts src/__tests__/notion/client.test.ts
git commit -m "feat: incremental sync with last_edited_time check and 이전 page filter"
```

---

## Task 4: `cache.ts` — 기존 캐시를 `crawlAllPages`에 전달

**Files:**
- Modify: `src/notion/cache.ts`
- Create: `src/__tests__/notion/cache.test.ts`

**Step 1: 테스트 작성**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../notion/client", () => ({
  crawlAllPages: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { crawlAllPages } from "../../notion/client";
import { syncNow, initCache, getPages } from "../../notion/cache";
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
    const existing = [mockPage("page-1"), mockPage("page-2")];
    (crawlAllPages as any).mockResolvedValue(existing);

    // initCache 없이 직접 syncNow 호출 (캐시는 빈 상태)
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
```

**Step 2: 테스트 실패 확인**

```bash
npm test -- src/__tests__/notion/cache.test.ts
```

Expected: FAIL — `crawlAllPages` 호출 시 두 번째 인자 없음

**Step 3: `src/notion/cache.ts` 수정**

`syncNow()` 함수를 아래와 같이 수정:

```ts
export async function syncNow(): Promise<number> {
  console.log("[cache] Starting Notion sync...");
  const existingCacheMap = new Map(cachedPages.map((p) => [p.id, p]));
  const pages = await crawlAllPages(config.notion.rootPageId, existingCacheMap);
  cachedPages = pages;
  saveToFile();
  console.log(`[cache] Sync complete: ${pages.length} pages cached`);
  return pages.length;
}
```

**Step 4: 테스트 통과 확인**

```bash
npm test -- src/__tests__/notion/cache.test.ts
```

Expected: PASS

**Step 5: 전체 테스트 + 빌드 확인**

```bash
npm test && npm run build
```

Expected: 모든 테스트 PASS, 빌드 성공

**Step 6: Commit**

```bash
git add src/notion/cache.ts src/__tests__/notion/cache.test.ts
git commit -m "feat: pass existing cache map to crawlAllPages for incremental sync"
```

---

## 완료 체크리스트

- [ ] vitest 설치 및 test 스크립트 추가
- [ ] `CachedNotionPage`에 `lastEditedAt` 필드 추가
- [ ] `client.ts`: 블록 1회 fetch + `last_edited_time` 비교 + "이전" 필터
- [ ] `cache.ts`: 기존 캐시를 Map으로 변환해 `crawlAllPages`에 전달
- [ ] 전체 테스트 통과 + 빌드 성공
