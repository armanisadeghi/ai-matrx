// features/marketing/seo/topical-map/panel/pageByKind.test.ts
//
// The panel asks `seo.map_topic_associations` for `pageSize + 1` rows per kind
// (2026-09-30: the unpaged read took 36 s for a 6,637-row topic). What each
// case defends:
//   · a kind that returned MORE than pageSize shows exactly pageSize rows and
//     continues from the LAST SHOWN row's cursor — continuing from the extra
//     row would skip it forever;
//   · a kind that returned pageSize or fewer is complete (no "Show more");
//   · kinds are paged independently, in the server's order.

import { pageByKind } from "./associationGroups";
import type { MapTopicAssociation } from "../types";

function row(kind: string, n: number): MapTopicAssociation {
  return {
    topic: "t",
    association: { kind, direction: "in", cursor: `in|2026-09-30T00:00:0${n}.000000Z|${kind}-${n}` },
    item: { type: kind, id: `${kind}-${n}` },
  } as MapTopicAssociation;
}

describe("pageByKind", () => {
  const rows = [row("seo_keyword", 1), row("seo_keyword", 2), row("seo_keyword", 3), row("web_page", 1), row("web_page", 2)];
  const pages = pageByKind(rows, 2);

  it("keeps pageSize rows of a kind that has more and continues from the last shown row", () => {
    const keywords = pages.get("seo_keyword");
    expect(keywords?.rows.map((r) => r.item.type === "seo_keyword" && "id" in r.item && r.item.id)).toEqual([
      "seo_keyword-1",
      "seo_keyword-2",
    ]);
    expect(keywords?.next).toBe("in|2026-09-30T00:00:02.000000Z|seo_keyword-2");
  });

  it("marks a kind with pageSize rows or fewer complete", () => {
    expect(pages.get("web_page")?.rows).toHaveLength(2);
    expect(pages.get("web_page")?.next).toBeNull();
  });

  it("keeps the server's kind order", () => {
    expect([...pages.keys()]).toEqual(["seo_keyword", "web_page"]);
  });
});
