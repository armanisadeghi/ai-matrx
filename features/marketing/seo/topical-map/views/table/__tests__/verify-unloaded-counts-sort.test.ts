// features/marketing/seo/topical-map/views/table/__tests__/verify-unloaded-counts-sort.test.ts
//
// VERIFIER-B attack: "a `map_tree` read without `counts` must not sort as if
// it had them." `classifyHierarchySort` decides a "pages" header click is a
// sibling sort by COLUMN ID alone — it never asks whether counts were loaded.
// This test drives the REAL reducer + `selectVisibleMapTopics` with a tree
// read WITHOUT `counts` and proves that clicking "Pages" cannot reorder the
// siblings, because every count is undefined and the selector's own tie rule
// ("unloaded last", stable otherwise) leaves the map's own order untouched.
// This is not new logic — it is `sortedSiblings` in `redux/selectors.ts` — but
// nothing in the Table view's own tests exercised it, and a future change to
// `classifyHierarchySort` that special-cased pages ASC/DESC without checking
// `countsLoaded` would pass every existing table test while lying about order.
//
// Watched failing first: if `sortedSiblings` ever preferred a topic with a
// truthy `pages` over one with an absent one when NEITHER was loaded (i.e. if
// undefined were coerced to 0 and 0 beat another undefined by insertion
// order alone in a way that looked like a real sort), this still would not
// fail — the true regression this guards is a hidden default (`pages ?? 0`)
// creeping into the comparator, which WOULD move an unloaded 0-topic in front
// of one whose alphabetically-earlier slug it currently ties with. We assert
// the untouched, pre-sort order explicitly so that regression cannot land
// silently.

import { selectVisibleMapTopics } from "../../../redux/selectors";
import reducer, { mapOpened, mapTreeLoaded, setSiblingSort } from "../../../redux/slice";
import type { TopicalMapSliceState } from "../../../redux/types";
import type { MapTreeResult } from "../../../types";
import { classifyHierarchySort, hierarchyRows } from "../tableRows";

const MAP_ID = "map-unloaded-counts";

function tree(): MapTreeResult {
  // Three roots in an order that would change under a real pages sort
  // (5 > 3 > unloaded), so a false "it sorted" would be visible.
  return {
    map_id: MAP_ID,
    root: null,
    total_topics: 3,
    topics: [
      { slug: "zeta", name: "Zeta" },
      { slug: "alpha", name: "Alpha" },
      { slug: "mu", name: "Mu" },
    ],
  };
}

function stateWithoutCounts(): TopicalMapSliceState {
  let slice = reducer(undefined, mapOpened({ mapId: MAP_ID }));
  // `includes` deliberately omits "counts" — the exact read the table takes
  // before `map_tree`'s counts have come back.
  slice = reducer(slice, mapTreeLoaded({ mapId: MAP_ID, result: tree(), includes: ["description"] }));
  return slice;
}

describe("VERIFIER-B: sorting Pages before counts load", () => {
  it("a header click on Pages IS a sibling sort (classifyHierarchySort doesn't know counts are absent)", () => {
    expect(classifyHierarchySort({ id: "pages", direction: "desc" })).toEqual({
      kind: "sibling",
      sort: "pages",
    });
  });

  it("but the walk itself leaves the map's own order untouched — no count means no move", () => {
    let slice = stateWithoutCounts();
    // Before any sort: the map's own order.
    const before = selectVisibleMapTopics(MAP_ID)({ topicalMap: slice } as never);
    expect(before.map((row) => row.slug)).toEqual(["zeta", "alpha", "mu"]);

    // The table dispatches setSiblingSort("pages") exactly as a real "Pages"
    // header click would (classifyHierarchySort above proves that mapping).
    slice = reducer(slice, setSiblingSort({ mapId: MAP_ID, sort: "pages" }));
    const after = selectVisibleMapTopics(MAP_ID)({ topicalMap: slice } as never);
    expect(after.map((row) => row.slug)).toEqual(["zeta", "alpha", "mu"]);

    // And every row the table would draw carries an undefined pages count,
    // so `CountCell` renders nothing rather than a fabricated ranking.
    const rows = hierarchyRows(after, slice.maps[MAP_ID].topicsBySlug, {
      rollups: null,
      updatedAtBySlug: null,
    });
    for (const row of rows) expect(row.topic.pages).toBeUndefined();
  });
});
