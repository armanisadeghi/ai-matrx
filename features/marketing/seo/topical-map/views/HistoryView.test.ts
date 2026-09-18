// features/marketing/seo/topical-map/views/HistoryView.test.ts
//
// Two rulings pinned (Lane G, 2026-09-18):
//   · RESTORE puts a topic back where it came from — rejected → proposed
//     (it was a proposal), retired → active (it was live). Watched failing
//     with both mapped to `active`: a rejected proposal would have gone live
//     without anyone accepting it.
//   · Who / since narrow the PAGE the function returned, client-side, and
//     nothing else — the function offers neither filter.

import type { MapHistoryEntry } from "../types";
import { RECORDED_FACTORY_PLAYGROUND_HISTORY } from "../proposals/__fixtures__/factoryPlaygroundRecorded";
import { filterHistoryEntries, restoreTarget } from "./HistoryView";

const ENTRIES: MapHistoryEntry[] = [
  {
    slug: "old-a",
    name: "Old A",
    status: "rejected",
    changed_at: "2026-09-10T10:00:00Z",
    changed_by: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    changed_by_tier: "agent",
  },
  {
    slug: "old-b",
    name: "Old B",
    status: "retired",
    changed_at: "2026-09-17T10:00:00Z",
    changed_by: "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    attachments: { pages: 2 },
  },
  { slug: "old-c", name: "Old C", status: "retired", changed_at: "2026-09-18T10:00:00Z" },
];

describe("restoreTarget", () => {
  it("sends a rejected proposal back to review, a retired topic back live", () => {
    expect(restoreTarget("rejected")).toBe("proposed");
    expect(restoreTarget("retired")).toBe("active");
  });
  it("offers nothing for a topic that never left", () => {
    expect(restoreTarget("active")).toBeNull();
    expect(restoreTarget("proposed")).toBeNull();
  });
});

describe("filterHistoryEntries", () => {
  it("narrows by who", () => {
    expect(
      filterHistoryEntries(ENTRIES, { changedBy: "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb", since: null }).map(
        (e) => e.slug,
      ),
    ).toEqual(["old-b"]);
  });
  it("narrows by since (inclusive of the day)", () => {
    expect(filterHistoryEntries(ENTRIES, { changedBy: null, since: "2026-09-17" }).map((e) => e.slug)).toEqual([
      "old-b",
      "old-c",
    ]);
  });
  it("keeps every RECORDED Factory Playground row when who matches the one recorded actor", () => {
    const rows = RECORDED_FACTORY_PLAYGROUND_HISTORY.items;
    expect(rows.every((r) => r.changed_by_tier === "human")).toBe(true);
    expect(
      filterHistoryEntries(rows, { changedBy: "87a6e699-3622-4869-8843-d0867456c0dd", since: "2026-09-17" }),
    ).toHaveLength(5);
    expect(filterHistoryEntries(rows, { changedBy: null, since: "2026-09-18" })).toHaveLength(0);
  });

  it("passes everything through with no filter", () => {
    expect(filterHistoryEntries(ENTRIES, { changedBy: null, since: null })).toHaveLength(3);
  });
});
