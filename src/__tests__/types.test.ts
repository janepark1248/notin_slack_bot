import { describe, it, expectTypeOf } from "vitest";
import type { CachedNotionPage } from "../types";

describe("CachedNotionPage", () => {
  it("lastEditedAt 필드가 string 타입이어야 한다", () => {
    expectTypeOf<CachedNotionPage>().toHaveProperty("lastEditedAt").toEqualTypeOf<string>();
  });
});
