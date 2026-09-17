// features/marketing/seo/topical-map/redux/selectors.ts
//
// U1 — "selectors that any view consumes (visible topics, counts, intent state
// per page, facets with inheritance)".
//
// EVERY per-map selector is CURRIED AND CACHED by map id. Building a new
// `createSelector` inside a component's render returns a new function every
// render, its memo is always cold, and `useAppSelector` sees a new reference
// every time — an infinite render loop. The `cached()` helper is the same
// device `features/notes/redux/selectors.ts` uses, for the same reason.

import { createSelector } from "@reduxjs/toolkit";

import type { RootState } from "@/lib/redux/store";

import type { MapTopicStatus, PageIntentRecord } from "../types";
import { createWorkspaceState } from "./slice";
import type {
  MapTopicFilters,
  MapViewKey,
  NormalizedMapTopic,
  PageIntentTone,
  PageIntentView,
  PageTopicState,
  PageTopicView,
  TopicalMapWorkspaceState,
  VisibleMapTopic,
} from "./types";

const selectorCache = new Map<string, unknown>();

function cached<T>(key: string, factory: () => T): T {
  const hit = selectorCache.get(key);
  if (hit !== undefined) return hit as T;
  const made = factory();
  selectorCache.set(key, made);
  return made;
}

/**
 * The workspace for a map that has never been opened. A stable module-level
 * object, because returning a fresh `{}` from a selector re-renders every
 * consumer on every store change.
 */
const ABSENT_WORKSPACE: TopicalMapWorkspaceState = Object.freeze(
  createWorkspaceState(""),
) as TopicalMapWorkspaceState;

const EMPTY_VISIBLE: readonly VisibleMapTopic[] = Object.freeze([]);
const EMPTY_SLUGS: readonly string[] = Object.freeze([]);
const EMPTY_PAGE_IDS: readonly string[] = Object.freeze([]);
const EMPTY_FACETS: Readonly<Record<string, string>> = Object.freeze({});

export const selectTopicalMapState = (state: RootState) => state.topicalMap;

/** One map's whole workspace. Prefer a narrower selector in a component. */
export function selectMapWorkspace(mapId: string) {
  return cached(`workspace:${mapId}`, () =>
    createSelector(
      [selectTopicalMapState],
      (slice): TopicalMapWorkspaceState => slice.maps[mapId] ?? ABSENT_WORKSPACE,
    ),
  );
}

// ── One property per selector (repo rule) ──────────────────────────────────

export function selectMapTopicsBySlug(mapId: string) {
  return cached(`topicsBySlug:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws) => ws.topicsBySlug),
  );
}

export function selectMapRootSlugs(mapId: string) {
  return cached(`rootSlugs:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws) => ws.rootSlugs),
  );
}

export function selectMapSelectedSlug(mapId: string) {
  return cached(`selected:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws) => ws.selectedSlug),
  );
}

export function selectMapCheckedSlugs(mapId: string) {
  return cached(`checked:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws) => ws.checkedSlugs),
  );
}

export function selectMapExpandedSlugs(mapId: string) {
  return cached(`expanded:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws) => ws.expandedSlugs),
  );
}

export function selectMapView(mapId: string) {
  return cached(`view:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws): MapViewKey => ws.view),
  );
}

export function selectMapFilters(mapId: string) {
  return cached(`filters:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws): MapTopicFilters => ws.filters),
  );
}

export function selectMapSiteId(mapId: string) {
  return cached(`siteId:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws) => ws.siteId),
  );
}

export function selectMapGroupBy(mapId: string) {
  return cached(`groupBy:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws) => ws.groupBy),
  );
}

export function selectMapLoadedAt(mapId: string) {
  return cached(`loadedAt:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws) => ws.loadedAt),
  );
}

/** Which `map_tree` include keys the loaded tree carried. Absent ≠ zero. */
export function selectMapLoadedIncludes(mapId: string) {
  return cached(`includes:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws) => ws.loadedIncludes),
  );
}

export function selectMapHasPendingWrites(mapId: string) {
  return cached(`pending:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws) => ws.optimistic.length > 0),
  );
}

/**
 * Non-zero means `seo.list_page_intents` collapsed duplicate intent edges.
 * ONE INTENT PER PAGE is the contract, so a non-zero value is a real defect the
 * screen must SAY, never quietly render one of the two.
 */
export function selectMapDuplicateIntents(mapId: string) {
  return cached(`duplicateIntents:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws) => ws.duplicateIntents),
  );
}

// ── Derived: the visible list every view renders ───────────────────────────

function matchesFilters(topic: NormalizedMapTopic, filters: MapTopicFilters): boolean {
  if (filters.text) {
    const needle = filters.text.toLowerCase();
    const haystack = `${topic.slug} ${topic.name} ${topic.description ?? ""}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  if (filters.statuses.length > 0) {
    const status = (topic.status ?? "active") as MapTopicStatus;
    if (!filters.statuses.includes(status)) return false;
  }
  for (const [key, value] of Object.entries(filters.facets)) {
    if (topic.facets?.[key] !== value) return false;
  }
  if (filters.onlyWithPages && (topic.pages ?? 0) + (topic.planned ?? 0) === 0) return false;
  if (filters.onlyGaps && (topic.pages ?? 0) + (topic.planned ?? 0) > 0) return false;
  return true;
}

/**
 * The flattened rows an outline, a table or a text view draws, in tree order,
 * honouring expansion.
 *
 * FILTERS KEEP ANCESTORS. A filtered-out parent whose descendant matches is
 * still emitted — dropping it would orphan the match and make the hierarchy a
 * lie. Such a parent is auto-revealed: with a filter on, expansion is the
 * filter's business, not the user's stale choice.
 */
export function selectVisibleMapTopics(mapId: string) {
  return cached(`visible:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws): readonly VisibleMapTopic[] => {
      if (ws.rootSlugs.length === 0) return EMPTY_VISIBLE;

      const filtering =
        ws.filters.text !== "" ||
        ws.filters.statuses.length > 0 ||
        Object.keys(ws.filters.facets).length > 0 ||
        ws.filters.onlyWithPages ||
        ws.filters.onlyGaps;

      const keep = new Set<string>();
      if (filtering) {
        const matchedSelf = new Set<string>();
        for (const topic of Object.values(ws.topicsBySlug)) {
          if (matchesFilters(topic, ws.filters)) matchedSelf.add(topic.slug);
        }
        for (const slug of matchedSelf) {
          keep.add(slug);
          let cursor = ws.topicsBySlug[slug]?.parentSlug ?? null;
          while (cursor && !keep.has(cursor)) {
            keep.add(cursor);
            cursor = ws.topicsBySlug[cursor]?.parentSlug ?? null;
          }
        }
        if (keep.size === 0) return EMPTY_VISIBLE;
      }

      const expanded = new Set(ws.expandedSlugs);
      const checked = new Set(ws.checkedSlugs);
      const rows: VisibleMapTopic[] = [];

      const walk = (slug: string): void => {
        const topic = ws.topicsBySlug[slug];
        if (!topic) return;
        if (filtering && !keep.has(slug)) return;
        const children = filtering
          ? topic.childSlugs.filter((child) => keep.has(child))
          : topic.childSlugs;
        const hasChildren = children.length > 0 || (topic.childrenCount ?? 0) > 0;
        // A filter reveals its own path; without one the user's choice rules.
        const isExpanded = filtering ? hasChildren : expanded.has(slug);
        rows.push({
          slug,
          name: topic.name,
          depth: topic.depth,
          hasChildren,
          expanded: isExpanded,
          selected: ws.selectedSlug === slug,
          checked: checked.has(slug),
          topic,
        });
        if (isExpanded) for (const child of children) walk(child);
      };

      for (const root of ws.rootSlugs) walk(root);
      return rows;
    }),
  );
}

/** One topic by slug, or null. */
export function selectMapTopic(mapId: string, slug: string) {
  return cached(`topic:${mapId}:${slug}`, () =>
    createSelector(
      [selectMapTopicsBySlug(mapId)],
      (topics): NormalizedMapTopic | null => topics[slug] ?? null,
    ),
  );
}

/** The slugs from the root down to `slug`, inclusive — the breadcrumb of §2.3. */
export function selectMapTopicPath(mapId: string, slug: string) {
  return cached(`path:${mapId}:${slug}`, () =>
    createSelector([selectMapTopicsBySlug(mapId)], (topics): readonly string[] => {
      if (!topics[slug]) return EMPTY_SLUGS;
      const path: string[] = [];
      let cursor: string | null = slug;
      while (cursor) {
        path.unshift(cursor);
        cursor = topics[cursor]?.parentSlug ?? null;
      }
      return path;
    }),
  );
}

/**
 * Facets that apply to one topic, INCLUDING inherited ones, and which ancestor
 * each came from.
 *
 * `seo.map_topic_facets` is the authoritative version (it carries the resolved
 * entity ref and the `inherited` flag). This is the loaded tree's answer, for a
 * view that must color 300 rows without 300 RPCs: `map_tree(include: facets)`
 * already folds inheritance in, so an own value is one the topic's own row
 * carries that no ancestor also carries at the same key.
 */
export interface InheritedFacet {
  key: string;
  valueSlug: string;
  inherited: boolean;
  /** The topic the value came from — the topic itself when `inherited` is false. */
  fromSlug: string;
}

export function selectMapTopicFacetsWithInheritance(mapId: string, slug: string) {
  return cached(`facets:${mapId}:${slug}`, () =>
    createSelector([selectMapTopicsBySlug(mapId)], (topics): readonly InheritedFacet[] => {
      const topic = topics[slug];
      if (!topic) return [];
      const own = topic.facets ?? EMPTY_FACETS;
      const out: InheritedFacet[] = [];
      for (const [key, valueSlug] of Object.entries(own)) {
        let fromSlug = slug;
        let inherited = false;
        let cursor = topic.parentSlug;
        while (cursor) {
          const ancestor = topics[cursor];
          if (ancestor?.facets?.[key] === valueSlug) {
            fromSlug = cursor;
            inherited = true;
          }
          cursor = ancestor?.parentSlug ?? null;
        }
        out.push({ key, valueSlug, inherited, fromSlug });
      }
      out.sort((a, b) => a.key.localeCompare(b.key));
      return out;
    }),
  );
}

/** Live / planned / keyword counts for one topic, and whether they were loaded at all. */
export interface MapTopicCounts {
  /** False when the tree was loaded without `include: ["counts"]` — then every number below is unknown. */
  loaded: boolean;
  pages: number;
  planned: number;
  keywords: number;
}

export function selectMapTopicCounts(mapId: string, slug: string) {
  return cached(`counts:${mapId}:${slug}`, () =>
    createSelector(
      [selectMapTopicsBySlug(mapId), selectMapLoadedIncludes(mapId)],
      (topics, includes): MapTopicCounts => {
        const topic = topics[slug];
        const loaded = includes.includes("counts") && topic?.pages !== undefined;
        return {
          loaded,
          pages: topic?.pages ?? 0,
          planned: topic?.planned ?? 0,
          keywords: topic?.keywords ?? 0,
        };
      },
    ),
  );
}

/** Rolled-up counts over every LOADED topic, for the map home's summary line. */
export function selectMapTotals(mapId: string) {
  return cached(`totals:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws) => {
      let pages = 0;
      let planned = 0;
      let keywords = 0;
      let proposed = 0;
      for (const topic of Object.values(ws.topicsBySlug)) {
        pages += topic.pages ?? 0;
        planned += topic.planned ?? 0;
        keywords += topic.keywords ?? 0;
        if (topic.status === "proposed") proposed += 1;
      }
      return {
        topicsLoaded: Object.keys(ws.topicsBySlug).length,
        topicsTotal: ws.totalTopics,
        countsLoaded: ws.loadedIncludes.includes("counts"),
        pages,
        planned,
        keywords,
        proposed,
      };
    }),
  );
}

// ── Intent state per page ──────────────────────────────────────────────────

export function selectMapIntentsByPageId(mapId: string) {
  return cached(`intents:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws) => ws.intentsByPageId),
  );
}

export function selectPageIntent(mapId: string, pageId: string) {
  return cached(`intent:${mapId}:${pageId}`, () =>
    createSelector(
      [selectMapIntentsByPageId(mapId)],
      (intents): PageIntentRecord | null => intents[pageId] ?? null,
    ),
  );
}

/** The site one page belongs to, learned from `list_page_intents`. `set_page_intents` needs it. */
export function selectPageIntentSiteId(mapId: string, pageId: string) {
  return cached(`intentSite:${mapId}:${pageId}`, () =>
    createSelector(
      [selectMapWorkspace(mapId)],
      (ws): string | null => ws.intentSiteByPageId[pageId] ?? null,
    ),
  );
}

/**
 * How ONE topic's row should color ONE page (§2.7). The same page is `leaving`
 * the topic it covers today and `arriving` at the topic its intent names, which
 * is why the topic is an argument rather than a property of the intent.
 *
 * `planned` is not produced here: a planned page is a `plan.node`, not a
 * `web_page` with an intent, so it has no intent row to read.
 */
export function pageIntentTone(
  view: PageIntentView,
  topicSlug: string,
): PageIntentTone | null {
  const covers = view.currentTopicSlugs.includes(topicSlug);
  const intended = view.intendedTopicSlug === topicSlug;
  if (view.disposition === "delete") return covers || intended ? "delete" : null;
  if (view.disposition === "keep" || view.disposition === "rewrite") {
    return covers || intended ? "in_place" : null;
  }
  // move | merge | redirect
  if (intended && !covers) return "arriving";
  if (covers && !intended) return "leaving";
  if (covers && intended) return "in_place";
  return null;
}

// ── Round 22 — a page never vanishes ───────────────────────────────────────
//
// `seo_topical_map_22_a_page_never_vanishes` (live 2026-09-17) changed two
// MEANINGS without changing a signature:
//
//   1. A `covers` edge into a topic that is not live is not coverage. A page
//      whose only topic was rejected or retired now comes back from
//      `seo.list_page_intents` with `current_topics: []` and is counted by
//      `seo.map_diagnostics.pages_on_no_topic`. Before the migration the page
//      fell out of BOTH readers and simply stopped existing.
//   2. An intent SURVIVES its topic being hidden but omits its `topic` key
//      while that topic is not live — the decision is still true, the
//      destination is gone.
//
// Everything below exists so a screen renders those two states honestly
// instead of printing a blank cell, which is law 4 from the other side.

/** The live topic slugs one listed page covers today, or `[]`. */
export function selectPageCoverage(mapId: string, pageId: string) {
  return cached(`coverage:${mapId}:${pageId}`, () =>
    createSelector(
      [selectMapWorkspace(mapId)],
      (ws): readonly string[] => ws.coverageByPageId[pageId] ?? EMPTY_PAGE_IDS,
    ),
  );
}

/**
 * Every LISTED page that covers no live topic of this map — the client-side
 * twin of `map_diagnostics.pages_on_no_topic`, over the pages actually loaded.
 *
 * It answers only for pages `seo.list_page_intents` has returned into this
 * workspace: a page nobody listed is absent from `coverageByPageId` entirely
 * and can never be mistaken for one that covers nothing.
 */
export function selectPagesOnNoTopic(mapId: string) {
  return cached(`pagesOnNoTopic:${mapId}`, () =>
    createSelector([selectMapWorkspace(mapId)], (ws): readonly string[] => {
      const out: string[] = [];
      for (const [pageId, slugs] of Object.entries(ws.coverageByPageId)) {
        if (slugs.length === 0) out.push(pageId);
      }
      return out.length > 0 ? out : EMPTY_PAGE_IDS;
    }),
  );
}

/**
 * Where ONE page stands in the map's topic structure — the state the plain
 * page list and the bulk screen colour by. See {@link PageTopicState} for what
 * each value means and why the last two have no `intent_colors` entry.
 *
 * PRECEDENCE, and the reason for it:
 *   1. `intent_topic_hidden` first. A destination that left the map is the
 *      most actionable thing true about the page, and it is the one state a
 *      reader cannot infer from anything else on the row.
 *   2. then the intent's own direction (`in_place` / `leaving` / `arriving`),
 *      because a page heading somewhere is better described by where it is
 *      going than by the hole it is currently in.
 *   3. then coverage alone: covering something live is `in_place`; covering
 *      nothing is `on_no_topic`.
 *
 * Pure, so a view, a test or a bulk action can call it without a store.
 */
export function pageTopicState(view: PageTopicView): PageTopicState {
  if (view.hasIntent && view.intendedTopicSlug === null) return "intent_topic_hidden";
  if (view.intendedTopicSlug !== null) {
    if (view.currentTopicSlugs.includes(view.intendedTopicSlug)) return "in_place";
    return view.currentTopicSlugs.length > 0 ? "leaving" : "arriving";
  }
  return view.currentTopicSlugs.length > 0 ? "in_place" : "on_no_topic";
}

/** {@link pageTopicState} for a page this workspace has listed. */
export function selectPageTopicState(mapId: string, pageId: string) {
  return cached(`topicState:${mapId}:${pageId}`, () =>
    createSelector(
      [selectPageCoverage(mapId, pageId), selectPageIntent(mapId, pageId)],
      (coverage, intent): PageTopicState =>
        pageTopicState({
          pageId,
          currentTopicSlugs: coverage as string[],
          hasIntent: intent !== null,
          intendedTopicSlug: intent?.topic?.slug ?? null,
        }),
    ),
  );
}

/**
 * One listed row as {@link pageTopicState} reads it, built straight from what
 * `seo.list_page_intents` returned. The list screen uses this rather than the
 * store so a page is described by the bytes on the row it is drawing.
 */
export function pageTopicViewOf(item: {
  page: { id: string };
  current_topics: { slug: string }[];
  intent: PageIntentRecord | null;
}): PageTopicView {
  return {
    pageId: item.page.id,
    currentTopicSlugs: item.current_topics.map((topic) => topic.slug),
    hasIntent: item.intent !== null,
    intendedTopicSlug: item.intent?.topic?.slug ?? null,
  };
}
