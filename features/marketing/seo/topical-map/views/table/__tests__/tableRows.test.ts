// features/marketing/seo/topical-map/views/table/__tests__/tableRows.test.ts
//
// R10 in the small: which header sorts the hierarchy can honour, when the
// table must flip to flat, and how the column set resolves from the knob.
// Every case drives the REAL reducer + `selectVisibleMapTopics` for the rows.
//
// Watched failing first:
//   · `classifyHierarchySort` returning "sibling" for a status sort → the
//     "flips on a data column" case fails;
//   · `resolveVisibleColumns` trusting an unknown id → the "drops unknown ids"
//     case fails;
//   · `flatRows` reading only `rootSlugs` → the "flat lists every topic" case fails.

import { selectVisibleMapTopics } from "../../../redux/selectors";
import reducer, { mapOpened, mapTreeLoaded, setSiblingSort } from "../../../redux/slice";
import type { TopicalMapSliceState } from "../../../redux/types";
import type { MapTreeResult } from "../../../types";
import {
  classifyHierarchySort,
  flatRows,
  hasActiveColumnFilter,
  hierarchyRows,
  resolveVisibleColumns,
  sortStateForSiblingSort,
} from "../tableRows";

const MAP_ID = "map-table-rows";
const NONE = { rollups: null, updatedAtBySlug: null };

function tree(): MapTreeResult {
  return {
    map_id: MAP_ID,
    root: null,
    total_topics: 3,
    topics: [
      {
        slug: "live-here",
        name: "Live here",
        pages: 3,
        planned: 0,
        keywords: 1,
        children: [{ slug: "child", name: "Child", pages: 1, planned: 0, keywords: 0 }],
      },
      { slug: "live-there", name: "Live there", pages: 5, planned: 2, keywords: 0 },
    ],
  };
}

function state(includes: string[] = ["counts"]): TopicalMapSliceState {
  let slice = reducer(undefined, mapOpened({ mapId: MAP_ID }));
  slice = reducer(slice, mapTreeLoaded({ mapId: MAP_ID, result: tree(), includes }));
  return slice;
}

describe("hierarchy rows", () => {
  it("are the selector's rows in its order — collapsed children stay hidden", () => {
    const slice = state();
    const visible = selectVisibleMapTopics(MAP_ID)({ topicalMap: slice } as never);
    const rows = hierarchyRows(visible, slice.maps[MAP_ID].topicsBySlug, NONE);
    expect(rows.map((row) => row.slug)).toEqual(["live-here", "live-there"]);
    expect(rows[0].hasChildren).toBe(true);
    expect(rows[0].expanded).toBe(false);
    expect(rows[0].rollup).toBeUndefined();
    expect(rows[0].updatedAt).toBeUndefined();
  });

  it("follow the sibling sort the store holds", () => {
    let slice = state();
    slice = reducer(slice, setSiblingSort({ mapId: MAP_ID, sort: "pages" }));
    const visible = selectVisibleMapTopics(MAP_ID)({ topicalMap: slice } as never);
    expect(visible.map((row) => row.slug)).toEqual(["live-there", "live-here"]);
  });
});

describe("flat rows", () => {
  it("list EVERY loaded topic regardless of expansion, with the ancestor path", () => {
    const slice = state();
    const rows = flatRows(slice.maps[MAP_ID].topicsBySlug, "child", ["live-there"], NONE);
    expect(rows.map((row) => row.slug).sort()).toEqual(["child", "live-here", "live-there"]);
    const child = rows.find((row) => row.slug === "child");
    expect(child?.ancestors).toEqual(["Live here"]);
    expect(child?.selected).toBe(true);
    expect(rows.find((row) => row.slug === "live-there")?.checked).toBe(true);
  });

  it("carry a loaded rollup as a real zero and an unloaded one as undefined", () => {
    const slice = state();
    const rollups = new Map([["live-here", { leaving: 1, arriving: 0 }]]);
    const rows = flatRows(slice.maps[MAP_ID].topicsBySlug, null, [], {
      rollups,
      updatedAtBySlug: null,
    });
    expect(rows.find((row) => row.slug === "live-here")?.rollup).toEqual({ leaving: 1, arriving: 0 });
    // Listed, but no page moves for it: a real zero, not "unknown".
    expect(rows.find((row) => row.slug === "live-there")?.rollup).toEqual({ leaving: 0, arriving: 0 });
  });
});

describe("R10 — sorts the hierarchy can honour", () => {
  it("maps name ascending and the three counts descending onto the sibling sort", () => {
    expect(classifyHierarchySort({ id: "topic", direction: "asc" })).toEqual({ kind: "sibling", sort: "name" });
    expect(classifyHierarchySort({ id: "pages", direction: "desc" })).toEqual({ kind: "sibling", sort: "pages" });
    expect(classifyHierarchySort({ id: "planned", direction: "desc" })).toEqual({ kind: "sibling", sort: "planned" });
    expect(classifyHierarchySort({ id: "keywords", direction: "desc" })).toEqual({ kind: "sibling", sort: "keywords" });
    expect(classifyHierarchySort(null)).toEqual({ kind: "sibling", sort: "sort_order" });
  });

  it("flips to flat on a data column, or on a direction the walk cannot express", () => {
    expect(classifyHierarchySort({ id: "status", direction: "asc" })).toEqual({
      kind: "flat",
      sort: { id: "status", direction: "asc" },
    });
    expect(classifyHierarchySort({ id: "pages", direction: "asc" })).toEqual({
      kind: "flat",
      sort: { id: "pages", direction: "asc" },
    });
    expect(classifyHierarchySort({ id: "leaving", direction: "desc" }).kind).toBe("flat");
  });

  it("mirrors the sibling sort back into the header arrows", () => {
    expect(sortStateForSiblingSort("sort_order")).toBeNull();
    expect(sortStateForSiblingSort("name")).toEqual({ id: "topic", direction: "asc" });
    expect(sortStateForSiblingSort("keywords")).toEqual({ id: "keywords", direction: "desc" });
  });

  it("treats any column filter with a value as the second flip trigger", () => {
    expect(hasActiveColumnFilter({})).toBe(false);
    expect(hasActiveColumnFilter({ status: undefined })).toBe(false);
    expect(hasActiveColumnFilter({ status: { kind: "select", value: "proposed" } })).toBe(true);
  });
});

describe("resolveVisibleColumns", () => {
  const KNOB = ["topic", "pages", "planned", "keywords", "status", "leaving", "arriving"];

  it("defaults to the knob's set, in the knob's order", () => {
    expect(resolveVisibleColumns(null, KNOB)).toEqual(KNOB);
  });

  it("uses the workspace's choice when it has one, topic always first", () => {
    expect(resolveVisibleColumns(["description", "pages"], KNOB)).toEqual(["topic", "description", "pages"]);
  });

  it("drops unknown ids instead of rendering a blank column", () => {
    expect(resolveVisibleColumns(["topic", "clicks", "pages"], KNOB)).toEqual(["topic", "pages"]);
    expect(resolveVisibleColumns(null, ["topic", "nonsense"])).toEqual(["topic"]);
  });
});
