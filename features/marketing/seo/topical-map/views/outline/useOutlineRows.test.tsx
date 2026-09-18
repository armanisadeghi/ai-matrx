/**
 * views/outline/useOutlineRows.test.tsx — the outline's store adapter and its
 * page rows, driven through the REAL reducer and the REAL selector against a
 * `seo.map_tree`-shaped payload (`__fixtures__/mapTreeShape.ts`) and
 * `seo.map_topic_associations`-shaped rows (`__fixtures__/pageAssociationsShape.ts`).
 *
 * Each case was watched failing first against a deliberate break:
 *   · `counts` set from `pages ?? 0` regardless of `loadedIncludes` → the
 *     "without counts" case fails (rows carry a `counts` key that lies);
 *   · `pagesOpen` ignored in `buildOutlineRows` → the page-rows case fails;
 *   · `topicPageRows` keyed by association row instead of page id → the
 *     "one row per page" case fails (STAYING and CONDEMNED appear twice);
 *   · the hidden branch removed → the "cannot open" case fails;
 *   · `dotsOn` ignored → the `outline_intent_dots=false` case fails;
 *   · `topicSlugOfRow` returning the raw id → the page-target case fails.
 */

import type { ReactElement } from "react";

import type { TopicTreeRow } from "@/components/official/topic-tree/TopicTree";

import type { MapIntentColors } from "../../knobs";
import { selectMapLoadedIncludes, selectVisibleMapTopics } from "../../redux/selectors";
import reducer, { mapOpened, mapTreeLoaded, setFilters, toggleExpanded } from "../../redux/slice";
import type { TopicalMapSliceState } from "../../redux/types";
import type { PageIntentRecord } from "../../types";
import { MAP_ID, TREE_WITHOUT_COUNTS, TREE_WITH_COUNTS } from "./__fixtures__/mapTreeShape";
import {
  PAGE_ARRIVING,
  PAGE_ASSOCIATIONS,
  PAGE_CONDEMNED,
  PAGE_IN_PLACE,
  PAGE_LEAVING,
  PAGE_STAYING,
  TOPIC_SLUG,
} from "./__fixtures__/pageAssociationsShape";
import {
  hiddenPagesRowId,
  pageRowId,
  parsePageRowId,
  topicPageRows,
  topicSlugOfRow,
  type OutlineHiddenPagesRow,
  type OutlinePageRow,
} from "./topicPageRows";
import { buildOutlineRows, clipSnippet, type OutlineRowTrailingProps } from "./useOutlineRows";

const COLORS: MapIntentColors = {
  in_place: "green",
  leaving: "amber",
  arriving: "blue",
  delete: "red",
  missing: "gray_dashed",
  planned: "purple_dashed",
};

function load(tree: typeof TREE_WITH_COUNTS, includes: string[]): TopicalMapSliceState {
  let state = reducer(undefined, mapOpened({ mapId: MAP_ID }));
  state = reducer(state, mapTreeLoaded({ mapId: MAP_ID, result: tree, includes }));
  return state;
}

function root(slice: TopicalMapSliceState) {
  return { topicalMap: slice } as never;
}

function rowsOf(
  slice: TopicalMapSliceState,
  overrides: Partial<Parameters<typeof buildOutlineRows>[0]> = {},
): TopicTreeRow[] {
  const topics = selectVisibleMapTopics(MAP_ID)(root(slice));
  const includes = selectMapLoadedIncludes(MAP_ID)(root(slice));
  return buildOutlineRows({
    topics,
    countsLoaded: includes.includes("counts"),
    detail: "labels",
    descriptionMaxChars: 80,
    pagesExpanded: new Set(),
    pageRowsFor: () => [],
    renderActions: () => null,
    renderPagesChip: () => null,
    ...overrides,
  });
}

function trailingProps(row: TopicTreeRow): OutlineRowTrailingProps {
  return (row.trailing as ReactElement<OutlineRowTrailingProps>).props;
}

describe("buildOutlineRows — absent is not zero", () => {
  it("a tree loaded WITHOUT counts yields rows with NO counts key", () => {
    const rows = rowsOf(load(TREE_WITHOUT_COUNTS, ["description", "status"]));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect("counts" in row).toBe(false);
    expect(trailingProps(rows[0]!).counts.loaded).toBe(false);
  });

  it("a tree loaded WITH counts carries them, and the proposed mark rides the status", () => {
    const rows = rowsOf(load(TREE_WITH_COUNTS, ["description", "status", "counts", "facets"]));
    const electronics = rows.find((row) => row.id === "electronics-recycling")!;
    expect(electronics.counts).toEqual({ pages: 12, planned: 1, keywords: 4 });
    const proposed = rows.find((row) => row.id === "data-destruction")!;
    expect(proposed.status).toBe("proposed");
    expect(trailingProps(proposed).status).toBe("proposed");
  });

  it("`outline_detail = labels` puts no counts in the trailing slot; `counts_snippet` adds a clipped snippet", () => {
    const slice = load(TREE_WITH_COUNTS, ["description", "status", "counts", "facets"]);
    const labels = rowsOf(slice, { detail: "labels" });
    expect(trailingProps(labels[0]!).showCounts).toBe(false);
    expect(trailingProps(labels[0]!).snippet).toBeNull();

    const snippet = rowsOf(slice, { detail: "counts_snippet", descriptionMaxChars: 40 });
    const props = trailingProps(snippet[0]!);
    expect(props.showCounts).toBe(true);
    expect(props.snippet).not.toBeNull();
    expect(props.snippet!.length).toBeLessThanOrEqual(41); // 40 chars + the ellipsis
    expect(props.snippet!.endsWith("…")).toBe(true);
  });
});

describe("buildOutlineRows — expansion, filters, page rows", () => {
  it("honours the slice's expansion: collapsed roots hide their children until toggled", () => {
    let slice = load(TREE_WITH_COUNTS, ["description", "status", "counts", "facets"]);
    expect(rowsOf(slice).map((row) => row.id)).toEqual([
      "electronics-recycling",
      "data-destruction",
      "about-all-green",
    ]);
    slice = reducer(slice, toggleExpanded({ mapId: MAP_ID, slug: "electronics-recycling" }));
    expect(rowsOf(slice).map((row) => row.id)).toEqual([
      "electronics-recycling",
      "hard-drive-shredding",
      "laptop-recycling",
      "data-destruction",
      "about-all-green",
    ]);
  });

  it("a text filter keeps the matching topic's ancestors and reveals them", () => {
    let slice = load(TREE_WITH_COUNTS, ["description", "status", "counts", "facets"]);
    slice = reducer(slice, setFilters({ mapId: MAP_ID, filters: { text: "degauss" } }));
    expect(rowsOf(slice).map((row) => row.id)).toEqual(["data-destruction", "degaussing"]);
  });

  it("splices page rows directly under a topic expanded to its pages, one level deeper", () => {
    const slice = load(TREE_WITH_COUNTS, ["description", "status", "counts", "facets"]);
    const rows = rowsOf(slice, {
      pagesExpanded: new Set(["about-all-green"]),
      pageRowsFor: (slug, depth) => [
        {
          id: pageRowId(slug, "p1"),
          parentId: slug,
          depth: depth + 1,
          label: "/about",
          hasChildren: false,
          expanded: false,
          selected: false,
        },
      ],
    });
    const at = rows.findIndex((row) => row.id === "about-all-green");
    expect(rows[at + 1]!.id).toBe(pageRowId("about-all-green", "p1"));
    expect(rows[at + 1]!.depth).toBe(rows[at]!.depth + 1);
  });
});

describe("topicPageRows — one honest row per page", () => {
  function pages(
    intents: Record<string, PageIntentRecord> = {},
    coverage: Record<string, string[]> = {},
    dotsOn = true,
  ) {
    return topicPageRows({
      slug: TOPIC_SLUG,
      depth: 0,
      associations: PAGE_ASSOCIATIONS,
      intents,
      coverage,
      colors: COLORS,
      dotsOn,
    });
  }

  it("collapses `covers` + `intent` on the same page into ONE row and answers the tone", () => {
    const rows = pages();
    const pageRows = rows.filter((row): row is OutlinePageRow => row.kind === "page");
    expect(pageRows.map((row) => row.pageId)).toEqual([
      PAGE_IN_PLACE.id,
      PAGE_STAYING.id,
      PAGE_ARRIVING.id,
      PAGE_LEAVING.id,
      PAGE_CONDEMNED.id,
    ]);
    const tone = Object.fromEntries(pageRows.map((row) => [row.pageId, row.tone]));
    expect(tone[PAGE_IN_PLACE.id]).toBe("in_place");
    expect(tone[PAGE_STAYING.id]).toBe("in_place");
    expect(tone[PAGE_ARRIVING.id]).toBe("arriving");
    expect(tone[PAGE_CONDEMNED.id]).toBe("delete");
    // Nothing anywhere says this page is leaving — until the workspace lists an intent.
    expect(tone[PAGE_LEAVING.id]).toBe("in_place");
    for (const row of pageRows) {
      expect(row.depth).toBe(1);
      expect(row.parentId).toBe(TOPIC_SLUG);
      expect(row.label).toBe(row.page.label);
    }
  });

  it("a workspace-listed intent to ANOTHER topic turns a covering page into `leaving`", () => {
    const rows = pages(
      {
        [PAGE_LEAVING.id]: {
          disposition: "move",
          state: "proposed",
          source: "agent",
          topic: { slug: "fresno", name: "Fresno" },
          updated_at: "2026-09-18T00:00:00Z",
        } as PageIntentRecord,
      },
      { [PAGE_LEAVING.id]: [TOPIC_SLUG] },
    );
    const leaving = rows.find(
      (row): row is OutlinePageRow => row.kind === "page" && row.pageId === PAGE_LEAVING.id,
    )!;
    expect(leaving.tone).toBe("leaving");
  });

  it("pages the caller cannot open become ONE row that says so, never a gap", () => {
    const hidden = pages().find(
      (row): row is OutlineHiddenPagesRow => row.kind === "hidden-pages",
    )!;
    expect(hidden.hidden).toBe(2);
    expect(hidden.id).toBe(hiddenPagesRowId(TOPIC_SLUG));
    expect(hidden.label).toBe("2 pages you cannot open");
  });

  it("`outline_intent_dots = false` keeps the rows and drops only the dot", () => {
    const withDots = pages({}, {}, true).filter((row) => row.kind === "page");
    const without = pages({}, {}, false).filter((row) => row.kind === "page");
    expect(without.length).toBe(withDots.length);
    const dotsOn = (withDots[0]!.trailing as ReactElement<{ dotsOn: boolean }>).props.dotsOn;
    const dotsOff = (without[0]!.trailing as ReactElement<{ dotsOn: boolean }>).props.dotsOn;
    expect(dotsOn).toBe(true);
    expect(dotsOff).toBe(false);
  });
});

describe("page-row ids", () => {
  it("round-trip, and a page row always resolves to its topic", () => {
    const id = pageRowId("electronics-recycling", PAGE_IN_PLACE.id);
    expect(parsePageRowId(id)).toEqual({ slug: "electronics-recycling", pageId: PAGE_IN_PLACE.id });
    expect(parsePageRowId("electronics-recycling")).toBeNull();
    expect(topicSlugOfRow(id)).toBe("electronics-recycling");
    expect(topicSlugOfRow("about-all-green")).toBe("about-all-green");
  });
});

describe("clipSnippet", () => {
  it("clips on a word boundary with an ellipsis and leaves short text alone", () => {
    expect(clipSnippet("short", 40)).toBe("short");
    const clipped = clipSnippet("one two three four five six seven eight nine ten", 20);
    expect(clipped.endsWith("…")).toBe(true);
    expect(clipped.length).toBeLessThanOrEqual(21);
    expect(clipped).not.toMatch(/\s…$/);
  });
});
