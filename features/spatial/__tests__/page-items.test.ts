import { appPagePath, pageTitleFor } from "../items/page-items";
import { recordKeyOf } from "../board/document";

const O = "http://app.test";

describe("page items — any page of the app on the board", () => {
  it("takes a path or an address on this site; never another site or a board", () => {
    expect(appPagePath("/meetings", O)).toBe("/meetings");
    expect(appPagePath("meetings/abc?tab=details", O)).toBe("/meetings/abc?tab=details");
    expect(appPagePath("http://app.test/meet/d36-8fb3?x=1", O)).toBe("/meet/d36-8fb3?x=1");
    expect(appPagePath("https://example.com/meetings", O)).toBeNull();
    expect(appPagePath("/board", O)).toBeNull();
    expect(appPagePath("/board/123", O)).toBeNull();
    expect(appPagePath("   ", O)).toBeNull();
  });
  it("titles a page from its address until it names itself", () => {
    expect(pageTitleFor("/meetings")).toBe("Meetings");
    expect(pageTitleFor("/data-v2/6ccf5064-1d7a-4c4f-9a62-1bbd0f3a2e11")).toBe("Page");
    expect(pageTitleFor("/research/topics")).toBe("Topics");
  });
  it("the same page is one tile on a board", () => {
    expect(recordKeyOf({ kind: "entity", entity: "page", id: "/meetings" })).toBe("page:/meetings");
  });
});
