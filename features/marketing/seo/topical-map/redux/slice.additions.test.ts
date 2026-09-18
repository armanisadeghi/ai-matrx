// features/marketing/seo/topical-map/redux/slice.additions.test.ts
//
// CONTRACTS §3's ten new actions, driven through the REAL reducer and read back
// through the REAL selectors — never by inspecting the draft.
//
// What each case is defending, because a reducer test that only re-states the
// reducer is worthless:
//   · a default that is a LIE (`table.columns: []` reading as "no columns"
//     rather than "the knob's set", `siblingSort` defaulting to anything but
//     the map's own order);
//   · `setPageFilters` replacing the filter object instead of merging, which
//     silently clears every other facet the user had set;
//   · `setReviewCursor({slug: null})` clearing the PAGE cursor too — two decks,
//     two places, and losing the other one is invisible until the user switches
//     back;
//   · the selector cache surviving `mapClosed` and handing a reopened map a
//     memo built over the old workspace.

import {
  evictMapSelectorCache,
  selectMapCheckedPageIds,
  selectMapGraph,
  selectMapPageFilters,
  selectMapReview,
  selectMapSiblingSort,
  selectMapTable,
} from "./selectors";
import reducer, {
  clearPageFilters,
  createWorkspaceState,
  mapClosed,
  mapOpened,
  setCheckedPages,
  setGraphEncodingMode,
  setGraphFocus,
  setPageFilters,
  setReviewCursor,
  setSiblingSort,
  setTableColumns,
  setTableHierarchy,
  togglePageChecked,
} from "./slice";
import type { TopicalMapSliceState } from "./types";

const MAP_ID = "map-additions";

function state(slice: TopicalMapSliceState) {
  return { topicalMap: slice } as never;
}

function opened() {
  return reducer(undefined, mapOpened({ mapId: MAP_ID }));
}

describe("createWorkspaceState defaults", () => {
  it("starts in the map's own order, with the knob's columns and no filters", () => {
    const ws = createWorkspaceState(MAP_ID);
    expect(ws.siblingSort).toBe("sort_order");
    // `null`, NEVER `[]` — an empty array would read as "show no columns".
    expect(ws.table.columns).toBeNull();
    expect(ws.table.hierarchy).toBe(true);
    expect(ws.graph).toEqual({ focusSlug: null, encodingMode: "structure" });
    expect(ws.review).toEqual({ cursorSlug: null, cursorPageId: null });
    expect(ws.checkedPageIds).toEqual([]);
    expect(ws.pageFilters).toEqual({
      text: "",
      topicSlug: null,
      regionSlug: null,
      traffic: "all",
      disposition: null,
      state: null,
      source: null,
      onNoTopic: false,
    });
  });
});

describe("page filters", () => {
  it("merges partial updates instead of replacing the whole object", () => {
    let slice = opened();
    slice = reducer(slice, setPageFilters({ mapId: MAP_ID, filters: { text: "pricing" } }));
    slice = reducer(
      slice,
      setPageFilters({ mapId: MAP_ID, filters: { disposition: "move" } }),
    );
    slice = reducer(slice, setPageFilters({ mapId: MAP_ID, filters: { onNoTopic: true } }));

    const filters = selectMapPageFilters(MAP_ID)(state(slice));
    expect(filters.text).toBe("pricing");
    expect(filters.disposition).toBe("move");
    expect(filters.onNoTopic).toBe(true);
    // Untouched keys survive.
    expect(filters.traffic).toBe("all");
  });

  it("clearPageFilters returns every key to its no-filter value", () => {
    let slice = opened();
    slice = reducer(
      slice,
      setPageFilters({
        mapId: MAP_ID,
        filters: { text: "x", traffic: "low", source: "mapper", onNoTopic: true },
      }),
    );
    slice = reducer(slice, clearPageFilters({ mapId: MAP_ID }));
    expect(selectMapPageFilters(MAP_ID)(state(slice))).toEqual(
      createWorkspaceState(MAP_ID).pageFilters,
    );
  });
});

describe("checked pages", () => {
  it("toggles on and off, and setCheckedPages de-duplicates", () => {
    let slice = opened();
    slice = reducer(slice, togglePageChecked({ mapId: MAP_ID, id: "page-1" }));
    slice = reducer(slice, togglePageChecked({ mapId: MAP_ID, id: "page-2" }));
    expect(selectMapCheckedPageIds(MAP_ID)(state(slice))).toEqual(["page-1", "page-2"]);

    slice = reducer(slice, togglePageChecked({ mapId: MAP_ID, id: "page-1" }));
    expect(selectMapCheckedPageIds(MAP_ID)(state(slice))).toEqual(["page-2"]);

    slice = reducer(
      slice,
      setCheckedPages({ mapId: MAP_ID, ids: ["page-3", "page-3", "page-4"] }),
    );
    expect(selectMapCheckedPageIds(MAP_ID)(state(slice))).toEqual(["page-3", "page-4"]);
  });
});

describe("graph, table and sibling sort round-trip", () => {
  it("keeps every value the way it went in", () => {
    let slice = opened();
    slice = reducer(slice, setGraphFocus({ mapId: MAP_ID, slug: "pricing" }));
    slice = reducer(slice, setGraphEncodingMode({ mapId: MAP_ID, mode: "convergence" }));
    slice = reducer(slice, setTableHierarchy({ mapId: MAP_ID, hierarchy: false }));
    slice = reducer(slice, setTableColumns({ mapId: MAP_ID, columns: ["name", "pages"] }));
    slice = reducer(slice, setSiblingSort({ mapId: MAP_ID, sort: "pages" }));

    expect(selectMapGraph(MAP_ID)(state(slice))).toEqual({
      focusSlug: "pricing",
      encodingMode: "convergence",
    });
    expect(selectMapTable(MAP_ID)(state(slice))).toEqual({
      hierarchy: false,
      columns: ["name", "pages"],
    });
    expect(selectMapSiblingSort(MAP_ID)(state(slice))).toBe("pages");

    // `null` restores the knob's set — it is not "no columns".
    slice = reducer(slice, setTableColumns({ mapId: MAP_ID, columns: null }));
    expect(selectMapTable(MAP_ID)(state(slice)).columns).toBeNull();
  });
});

describe("review cursors", () => {
  it("moves only the cursor named, and an explicit null clears only that one", () => {
    let slice = opened();
    slice = reducer(
      slice,
      setReviewCursor({ mapId: MAP_ID, slug: "topic-a", pageId: "page-9" }),
    );
    expect(selectMapReview(MAP_ID)(state(slice))).toEqual({
      cursorSlug: "topic-a",
      cursorPageId: "page-9",
    });

    // Only the topic deck finished.
    slice = reducer(slice, setReviewCursor({ mapId: MAP_ID, slug: null }));
    expect(selectMapReview(MAP_ID)(state(slice))).toEqual({
      cursorSlug: null,
      cursorPageId: "page-9",
    });

    // An omitted key changes nothing.
    slice = reducer(slice, setReviewCursor({ mapId: MAP_ID, pageId: "page-10" }));
    expect(selectMapReview(MAP_ID)(state(slice))).toEqual({
      cursorSlug: null,
      cursorPageId: "page-10",
    });
  });
});

describe("mapClosed and the selector cache", () => {
  it("drops the workspace and, once evicted, rebuilds the selectors", () => {
    let slice = opened();
    slice = reducer(slice, setSiblingSort({ mapId: MAP_ID, sort: "keywords" }));
    const before = selectMapSiblingSort(MAP_ID);
    expect(before(state(slice))).toBe("keywords");

    slice = reducer(slice, mapClosed({ mapId: MAP_ID }));
    evictMapSelectorCache(MAP_ID);

    const after = selectMapSiblingSort(MAP_ID);
    // A NEW selector — the cache no longer holds one memoised over the closed
    // workspace.
    expect(after).not.toBe(before);
    expect(after(state(slice))).toBe("sort_order");
  });

  it("evicting one map leaves another map's selectors alone", () => {
    const other = `${MAP_ID}-sibling`;
    let slice = reducer(undefined, mapOpened({ mapId: MAP_ID }));
    slice = reducer(slice, mapOpened({ mapId: other }));
    const kept = selectMapSiblingSort(other);
    // A prefix collision must not evict the longer id.
    evictMapSelectorCache(MAP_ID);
    expect(selectMapSiblingSort(other)).toBe(kept);
  });
});
