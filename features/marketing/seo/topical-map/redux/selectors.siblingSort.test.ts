// features/marketing/seo/topical-map/redux/selectors.siblingSort.test.ts
//
// CONTRACTS §3: `selectVisibleMapTopics` orders siblings by the workspace's
// `siblingSort`, and a count that was never loaded sorts LAST — never as a zero.
//
// WHY THIS FILE EXISTS SEPARATELY FROM `slice.additions.test.ts`. Round-tripping
// `setSiblingSort` through the store proves the value is stored; it proves
// nothing about the walk. The defect this guards is the quiet one: a tree read
// WITHOUT `include: ["counts"]` carries `pages === undefined` on every topic, so
// a `?? 0` anywhere in the comparator turns "we did not ask for counts" into a
// confident ranking of an unmeasured map. That screen looks right and is wrong.
//
// Watched failing first, three ways:
//   · comparator changed to `topics[a]?.pages ?? 0` → the absent-counts cases
//     below fail (the unloaded topic ranks with the zeroes instead of last);
//   · `sortedSiblings` applied to children but not to `ws.rootSlugs` → the root
//     ordering cases fail;
//   · the comparator's `undefined` arms removed → the "an unloaded tree keeps
//     the map's own order" case fails.
//
// It drives the REAL reducer with a `seo.map_tree`-shaped payload and reads the
// REAL selector, so nothing here is asserted against a hand-built workspace.

import { selectVisibleMapTopics } from "./selectors";
import reducer, {
  expandAll,
  mapOpened,
  mapTreeLoaded,
  setSiblingSort,
} from "./slice";
import type { MapSiblingSort, TopicalMapSliceState } from "./types";
import type { MapTreeNode, MapTreeResult } from "../types";

const MAP_ID = "map-sibling-sort";

/**
 * Three roots and three children, with the counts deliberately disagreeing with
 * both the tree order and the alphabet — otherwise a sort that does nothing
 * would pass every case.
 *
 * `bravo` carries NO counts at all: that is a topic `map_tree` returned without
 * `include: ["counts"]`, which is the whole point of the file.
 */
function node(
  slug: string,
  name: string,
  counts: { pages?: number; planned?: number; keywords?: number },
  children?: MapTreeNode[],
): MapTreeNode {
  return { slug, name, ...counts, ...(children ? { children } : {}) };
}

function tree(): MapTreeResult {
  return {
    map_id: MAP_ID,
    root: null,
    total_topics: 6,
    topics: [
      // Tree order: charlie, bravo, alpha. Alphabetical: alpha, bravo, charlie.
      // `bravo` carries no counts; `alpha` carries a REAL `planned: 0`, and it
      // sits AFTER bravo in tree order — that pairing is what separates
      // "absent sorts last" from "absent is zero", because a stable sort leaves
      // a zero/absent tie in tree order and hides the bug.
      node("charlie", "Charlie", { pages: 12, planned: 1, keywords: 3 }, [
        node("c-none", "C none", {}),
        node("c-low", "C low", { pages: 1, planned: 9, keywords: 0 }),
        node("c-high", "C high", { pages: 7, planned: 2, keywords: 40 }),
      ]),
      node("bravo", "Bravo", {}),
      node("alpha", "Alpha", { pages: 5, planned: 0, keywords: 11 }),
    ],
  };
}

function loaded(sort?: MapSiblingSort): TopicalMapSliceState {
  let slice = reducer(undefined, mapOpened({ mapId: MAP_ID }));
  slice = reducer(
    slice,
    mapTreeLoaded({
      mapId: MAP_ID,
      result: tree(),
      includes: ["counts"],
    }),
  );
  slice = reducer(slice, expandAll({ mapId: MAP_ID }));
  if (sort) slice = reducer(slice, setSiblingSort({ mapId: MAP_ID, sort }));
  return slice;
}

function slugsUnder(sort: MapSiblingSort | undefined, parentDepth: number): string[] {
  const rows = selectVisibleMapTopics(MAP_ID)({ topicalMap: loaded(sort) } as never);
  return rows.filter((row) => row.depth === parentDepth).map((row) => row.slug);
}

describe("selectVisibleMapTopics sibling ordering", () => {
  it("defaults to sort_order — the map's own arrangement, untouched", () => {
    expect(slugsUnder(undefined, 0)).toEqual(["charlie", "bravo", "alpha"]);
    expect(slugsUnder("sort_order", 1)).toEqual(["c-none", "c-low", "c-high"]);
  });

  it("sorts by name at every level", () => {
    expect(slugsUnder("name", 0)).toEqual(["alpha", "bravo", "charlie"]);
    expect(slugsUnder("name", 1)).toEqual(["c-high", "c-low", "c-none"]);
  });

  it("sorts counts DESCENDING, with an absent count last", () => {
    // pages: charlie 12, alpha 5, bravo absent.
    expect(slugsUnder("pages", 0)).toEqual(["charlie", "alpha", "bravo"]);
    // children — c-high 7, c-low 1, c-none absent.
    expect(slugsUnder("pages", 1)).toEqual(["c-high", "c-low", "c-none"]);
  });

  it("a REAL zero outranks an absent count — absent is not zero", () => {
    // keywords: c-high 40, c-low 0, c-none ABSENT, and c-none comes FIRST in
    // tree order. Read `?? 0` and the two tie, the stable sort keeps tree order
    // and c-none jumps ahead of a topic that really does have zero keywords.
    expect(slugsUnder("keywords", 1)).toEqual(["c-high", "c-low", "c-none"]);
    // The same trap one level up: alpha really has 0 planned pages and sits
    // after the countless bravo in tree order.
    expect(slugsUnder("planned", 0)).toEqual(["charlie", "alpha", "bravo"]);
  });

  it("planned sorts on its own field, not on pages", () => {
    // planned: c-low 9, c-high 2, c-none absent — the opposite of the pages order.
    expect(slugsUnder("planned", 1)).toEqual(["c-low", "c-high", "c-none"]);
  });

  it("a tree loaded WITHOUT counts keeps the map's own order under every count sort", () => {
    // Every sibling absent → the comparator must return 0 for every pair and the
    // stable sort must leave the tree exactly as the server returned it. A `?? 0`
    // comparator also returns 0 here, which is why the cases above exist too.
    let slice = reducer(undefined, mapOpened({ mapId: MAP_ID }));
    slice = reducer(
      slice,
      mapTreeLoaded({
        mapId: MAP_ID,
        result: {
          map_id: MAP_ID,
          root: null,
          total_topics: 3,
          topics: [node("zulu", "Zulu", {}), node("mike", "Mike", {}), node("echo", "Echo", {})],
        },
        includes: [],
      }),
    );
    slice = reducer(slice, setSiblingSort({ mapId: MAP_ID, sort: "pages" }));
    const rows = selectVisibleMapTopics(MAP_ID)({ topicalMap: slice } as never);
    expect(rows.map((row) => row.slug)).toEqual(["zulu", "mike", "echo"]);
  });
});
