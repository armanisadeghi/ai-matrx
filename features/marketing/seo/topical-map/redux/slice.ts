// features/marketing/seo/topical-map/redux/slice.ts
//
// U1 — the one store slice every topical-map view reads (requirements §4 U1).
//
// ONE ENTRY PER MAP. Selection, expansion, the current view and the filters
// live here rather than in component state for one concrete reason: the four
// views are ROUTES, not tabs (placement §3), so every switch unmounts the view
// component. Anything the user chose that lives in a component dies with it.
// U1's done-criterion — "selection and expansion state survive switching
// views" — is exactly this decision.
//
// Nothing in here calls the database. The hooks in `../hooks.ts` own every RPC
// and feed this slice; the slice owns what the user has chosen and what an
// optimistic write has provisionally changed.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  isRootedMapTree,
  type MapTopicPatch,
  type MapTreeNode,
  type MapTreeResult,
  type PageIntentItem,
  type PageIntentsResult,
} from "../types";
import {
  emptyMapPageFilters,
  emptyMapTopicFilters,
  type MapPageFilters,
  type MapSiblingSort,
  type MapTopicFilters,
  type MapViewKey,
  type NormalizedMapTopic,
  type OptimisticEdit,
  type TopicalMapSliceState,
  type TopicalMapWorkspaceState,
} from "./types";

const initialState: TopicalMapSliceState = { maps: {} };

export function createWorkspaceState(mapId: string): TopicalMapWorkspaceState {
  return {
    mapId,
    topicsBySlug: {},
    rootSlugs: [],
    totalTopics: 0,
    loadedIncludes: [],
    loadedAt: null,
    selectedSlug: null,
    checkedSlugs: [],
    expandedSlugs: [],
    view: "outline",
    filters: emptyMapTopicFilters(),
    siteId: null,
    groupBy: null,
    intentsByPageId: {},
    coverageByPageId: {},
    intentSiteByPageId: {},
    duplicateIntents: 0,
    optimistic: [],
    pageFilters: emptyMapPageFilters(),
    checkedPageIds: [],
    // "structure" is the honest default: it draws what the map IS. The
    // convergence encoding draws where pages are MOVING, which is a reading of
    // intent data a workspace may not have loaded yet.
    graph: { focusSlug: null, encodingMode: "structure" },
    // `hierarchy: true` — the table is a table OF A TREE. Flattening by default
    // would silently drop the one thing the map is about; the user turns it off.
    // `columns: null` is "the knob's default set", never "no columns".
    table: { hierarchy: true, columns: null },
    review: { cursorSlug: null, cursorPageId: null },
    siblingSort: "sort_order",
  };
}

function workspace(
  state: TopicalMapSliceState,
  mapId: string,
): TopicalMapWorkspaceState {
  const existing = state.maps[mapId];
  if (existing) return existing;
  const created = createWorkspaceState(mapId);
  state.maps[mapId] = created;
  return created;
}

/**
 * Flattens one `map_tree` result into `topicsBySlug` + `rootSlugs`.
 *
 * A node that hit the depth limit carries `children_count` INSTEAD of
 * `children` (data.ts' own note). That distinction is preserved: `childSlugs`
 * stays empty and `childrenCount` is set, so an expander is still drawn and the
 * view knows it must fetch deeper rather than concluding "leaf".
 */
function normalizeTree(result: MapTreeResult): {
  topicsBySlug: Record<string, NormalizedMapTopic>;
  rootSlugs: string[];
  totalTopics: number;
} {
  const topicsBySlug: Record<string, NormalizedMapTopic> = {};

  function walk(node: MapTreeNode, parentSlug: string | null, depth: number): void {
    const childSlugs = (node.children ?? []).map((child) => child.slug);
    topicsBySlug[node.slug] = {
      slug: node.slug,
      name: node.name,
      description: node.description,
      status: node.status,
      parentSlug,
      childSlugs,
      childrenCount: node.children_count,
      pages: node.pages,
      planned: node.planned,
      keywords: node.keywords,
      path: node.path,
      facets: node.facets,
      associations: node.associations,
      depth,
    };
    for (const child of node.children ?? []) walk(child, node.slug, depth + 1);
  }

  if (isRootedMapTree(result)) {
    walk(result.topic, null, 0);
    return {
      topicsBySlug,
      rootSlugs: [result.topic.slug],
      totalTopics: Object.keys(topicsBySlug).length,
    };
  }
  for (const root of result.topics) walk(root, null, 0);
  return {
    topicsBySlug,
    rootSlugs: result.topics.map((root) => root.slug),
    totalTopics: result.total_topics,
  };
}

/** Re-stamps `depth` down a subtree after a move changed where it hangs. */
function restampDepth(
  topics: Record<string, NormalizedMapTopic>,
  slug: string,
  depth: number,
): void {
  const topic = topics[slug];
  if (!topic) return;
  topic.depth = depth;
  for (const child of topic.childSlugs) restampDepth(topics, child, depth + 1);
}

function snapshot(
  ws: TopicalMapWorkspaceState,
  slugs: string[],
): Record<string, NormalizedMapTopic> {
  const before: Record<string, NormalizedMapTopic> = {};
  for (const slug of slugs) {
    const topic = ws.topicsBySlug[slug];
    if (topic) before[slug] = structuredClone(topic);
  }
  return before;
}

/** Every slug a move or a patch touches: the topic, its old parent, its new parent. */
function movedSlugs(
  ws: TopicalMapWorkspaceState,
  slug: string,
  newParentSlug: string | null,
): string[] {
  const touched = new Set<string>([slug]);
  const current = ws.topicsBySlug[slug];
  if (current?.parentSlug) touched.add(current.parentSlug);
  if (newParentSlug) touched.add(newParentSlug);
  return [...touched];
}

const topicalMapSlice = createSlice({
  name: "topicalMap",
  initialState,
  reducers: {
    /** Opens a workspace without loading anything, so a route can set the view before data arrives. */
    mapOpened(state, action: PayloadAction<{ mapId: string }>) {
      workspace(state, action.payload.mapId);
    },

    /**
     * Replaces the loaded tree. Selection, expansion, view, filters and the
     * site survive — a refetch after an edit must not throw away where the user
     * is. A selected or expanded slug that no longer exists is dropped, because
     * pointing at a retired topic is how a panel renders an empty body forever.
     */
    mapTreeLoaded(
      state,
      action: PayloadAction<{ mapId: string; result: MapTreeResult; includes: string[] }>,
    ) {
      const { mapId, result, includes } = action.payload;
      const ws = workspace(state, mapId);
      const { topicsBySlug, rootSlugs, totalTopics } = normalizeTree(result);
      ws.topicsBySlug = topicsBySlug;
      ws.rootSlugs = rootSlugs;
      ws.totalTopics = totalTopics;
      ws.loadedIncludes = includes;
      ws.loadedAt = new Date().toISOString();
      ws.optimistic = [];
      if (ws.selectedSlug && !topicsBySlug[ws.selectedSlug]) ws.selectedSlug = null;
      ws.checkedSlugs = ws.checkedSlugs.filter((slug) => Boolean(topicsBySlug[slug]));
      ws.expandedSlugs = ws.expandedSlugs.filter((slug) => Boolean(topicsBySlug[slug]));
    },

    /** Merges one already-read topic row's `layout` in without refetching the tree. */
    topicLayoutLoaded(
      state,
      action: PayloadAction<{ mapId: string; slug: string; layout: unknown }>,
    ) {
      const ws = workspace(state, action.payload.mapId);
      const topic = ws.topicsBySlug[action.payload.slug];
      if (topic) topic.layout = action.payload.layout;
    },

    selectTopic(state, action: PayloadAction<{ mapId: string; slug: string | null }>) {
      workspace(state, action.payload.mapId).selectedSlug = action.payload.slug;
    },

    setCheckedTopics(state, action: PayloadAction<{ mapId: string; slugs: string[] }>) {
      workspace(state, action.payload.mapId).checkedSlugs = [
        ...new Set(action.payload.slugs),
      ];
    },

    toggleTopicChecked(state, action: PayloadAction<{ mapId: string; slug: string }>) {
      const ws = workspace(state, action.payload.mapId);
      const index = ws.checkedSlugs.indexOf(action.payload.slug);
      if (index === -1) ws.checkedSlugs.push(action.payload.slug);
      else ws.checkedSlugs.splice(index, 1);
    },

    toggleExpanded(state, action: PayloadAction<{ mapId: string; slug: string }>) {
      const ws = workspace(state, action.payload.mapId);
      const index = ws.expandedSlugs.indexOf(action.payload.slug);
      if (index === -1) ws.expandedSlugs.push(action.payload.slug);
      else ws.expandedSlugs.splice(index, 1);
    },

    setExpanded(
      state,
      action: PayloadAction<{ mapId: string; slug: string; expanded: boolean }>,
    ) {
      const ws = workspace(state, action.payload.mapId);
      const index = ws.expandedSlugs.indexOf(action.payload.slug);
      if (action.payload.expanded && index === -1) ws.expandedSlugs.push(action.payload.slug);
      if (!action.payload.expanded && index !== -1) ws.expandedSlugs.splice(index, 1);
    },

    /** Expands every ancestor of `slug` so a deep topic reached from search is actually on screen. */
    revealTopic(state, action: PayloadAction<{ mapId: string; slug: string }>) {
      const ws = workspace(state, action.payload.mapId);
      let cursor = ws.topicsBySlug[action.payload.slug]?.parentSlug ?? null;
      while (cursor) {
        if (!ws.expandedSlugs.includes(cursor)) ws.expandedSlugs.push(cursor);
        cursor = ws.topicsBySlug[cursor]?.parentSlug ?? null;
      }
      ws.selectedSlug = action.payload.slug;
    },

    expandAll(state, action: PayloadAction<{ mapId: string }>) {
      const ws = workspace(state, action.payload.mapId);
      ws.expandedSlugs = Object.values(ws.topicsBySlug)
        .filter((topic) => topic.childSlugs.length > 0 || (topic.childrenCount ?? 0) > 0)
        .map((topic) => topic.slug);
    },

    collapseAll(state, action: PayloadAction<{ mapId: string }>) {
      workspace(state, action.payload.mapId).expandedSlugs = [];
    },

    setView(state, action: PayloadAction<{ mapId: string; view: MapViewKey }>) {
      workspace(state, action.payload.mapId).view = action.payload.view;
    },

    setFilters(
      state,
      action: PayloadAction<{ mapId: string; filters: Partial<MapTopicFilters> }>,
    ) {
      const ws = workspace(state, action.payload.mapId);
      ws.filters = { ...ws.filters, ...action.payload.filters };
    },

    clearFilters(state, action: PayloadAction<{ mapId: string }>) {
      workspace(state, action.payload.mapId).filters = emptyMapTopicFilters();
    },

    setSiteId(state, action: PayloadAction<{ mapId: string; siteId: string | null }>) {
      workspace(state, action.payload.mapId).siteId = action.payload.siteId;
    },

    setGroupBy(state, action: PayloadAction<{ mapId: string; groupBy: string | null }>) {
      workspace(state, action.payload.mapId).groupBy = action.payload.groupBy;
    },

    /** Stores what `seo.list_page_intents` returned, keyed for O(1) lookup per page. */
    pageIntentsLoaded(
      state,
      action: PayloadAction<{ mapId: string; result: PageIntentsResult; replace: boolean }>,
    ) {
      const ws = workspace(state, action.payload.mapId);
      if (action.payload.replace) {
        ws.intentsByPageId = {};
        ws.coverageByPageId = {};
        ws.intentSiteByPageId = {};
      }
      for (const item of action.payload.result.items as PageIntentItem[]) {
        if (item.intent) ws.intentsByPageId[item.page.id] = item.intent;
        else delete ws.intentsByPageId[item.page.id];
        // ROUND 22: an EMPTY list is stored, never skipped. "Covers nothing
        // live" and "we never listed this page" are different answers, and a
        // missing key is the only way a reader could tell them apart.
        ws.coverageByPageId[item.page.id] = item.current_topics.map((topic) => topic.slug);
        if (item.page.site_id) ws.intentSiteByPageId[item.page.id] = item.page.site_id;
      }
      ws.duplicateIntents = action.payload.result.duplicate_intents;
    },

    // ── Optimistic writes ────────────────────────────────────────────────────
    //
    // Each of the three begins an edit, applies it to the store immediately and
    // keeps the exact `before` rows. `optimisticCommitted` drops the snapshot
    // once the RPC confirmed; `optimisticRolledBack` restores it when it did
    // not. A rollback is never a refetch — a refetch would hide the fact that
    // the user's change did not land behind a blink of fresh data.

    /**
     * `seo.patch_map_topics` — one edit per topic. Only the keys present on an
     * edit are touched, exactly as the RPC behaves. A `new_slug` re-keys the
     * row and repoints its parent and children so the tree stays walkable.
     */
    optimisticPatch(
      state,
      action: PayloadAction<{ mapId: string; opId: string; edits: MapTopicPatch[] }>,
    ) {
      const { mapId, opId, edits } = action.payload;
      const ws = workspace(state, mapId);
      const touched = new Set<string>();
      for (const edit of edits) {
        touched.add(edit.slug);
        const topic = ws.topicsBySlug[edit.slug];
        if (topic?.parentSlug) touched.add(topic.parentSlug);
        if (edit.parent_slug) touched.add(edit.parent_slug);
        for (const child of topic?.childSlugs ?? []) touched.add(child);
      }
      const edit: OptimisticEdit = {
        opId,
        kind: "patch",
        slugs: [...touched],
        before: snapshot(ws, [...touched]),
        beforeRootSlugs: [...ws.rootSlugs],
        startedAt: Date.now(),
      };
      ws.optimistic.push(edit);

      for (const patch of edits) {
        const topic = ws.topicsBySlug[patch.slug];
        if (!topic) continue;
        if (patch.name !== undefined) topic.name = patch.name;
        if (patch.description !== undefined) topic.description = patch.description;
        if (patch.status !== undefined) topic.status = patch.status;
        if (patch.parent_slug !== undefined) {
          reparent(ws, patch.slug, patch.parent_slug);
        }
        if (patch.new_slug !== undefined && patch.new_slug !== patch.slug) {
          rekey(ws, patch.slug, patch.new_slug);
        }
      }
    },

    /** `seo.move_map_topic` — `null` moves the topic to the root. */
    optimisticMove(
      state,
      action: PayloadAction<{
        mapId: string;
        opId: string;
        slug: string;
        newParentSlug: string | null;
      }>,
    ) {
      const { mapId, opId, slug, newParentSlug } = action.payload;
      const ws = workspace(state, mapId);
      const slugs = movedSlugs(ws, slug, newParentSlug);
      ws.optimistic.push({
        opId,
        kind: "move",
        slugs,
        before: snapshot(ws, slugs),
        beforeRootSlugs: [...ws.rootSlugs],
        startedAt: Date.now(),
      });
      reparent(ws, slug, newParentSlug);
    },

    /** Dragging a node in the graph view writes `seo.map_topic.layout`. */
    optimisticLayout(
      state,
      action: PayloadAction<{
        mapId: string;
        opId: string;
        slug: string;
        layout: unknown;
      }>,
    ) {
      const { mapId, opId, slug, layout } = action.payload;
      const ws = workspace(state, mapId);
      ws.optimistic.push({
        opId,
        kind: "layout",
        slugs: [slug],
        before: snapshot(ws, [slug]),
        beforeRootSlugs: null,
        startedAt: Date.now(),
      });
      const topic = ws.topicsBySlug[slug];
      if (topic) topic.layout = layout;
    },

    optimisticCommitted(state, action: PayloadAction<{ mapId: string; opId: string }>) {
      const ws = workspace(state, action.payload.mapId);
      ws.optimistic = ws.optimistic.filter((edit) => edit.opId !== action.payload.opId);
    },

    /**
     * Puts back exactly what was there. Edits made AFTER this one are left
     * alone on purpose: they were applied to a tree that already carried this
     * change, and silently unwinding them would move rows the user never
     * touched. The hook layer surfaces the failure; the views show it.
     */
    optimisticRolledBack(state, action: PayloadAction<{ mapId: string; opId: string }>) {
      const ws = workspace(state, action.payload.mapId);
      const edit = ws.optimistic.find((candidate) => candidate.opId === action.payload.opId);
      if (!edit) return;
      for (const slug of edit.slugs) {
        const before = edit.before[slug];
        if (before) ws.topicsBySlug[slug] = before;
        else delete ws.topicsBySlug[slug];
      }
      if (edit.beforeRootSlugs) ws.rootSlugs = edit.beforeRootSlugs;
      ws.optimistic = ws.optimistic.filter((candidate) => candidate.opId !== edit.opId);
    },

    // ── CONTRACTS §3 additions ───────────────────────────────────────────────

    /** Merges the named keys into the pages workspace's filters. */
    setPageFilters(
      state,
      action: PayloadAction<{ mapId: string; filters: Partial<MapPageFilters> }>,
    ) {
      const ws = workspace(state, action.payload.mapId);
      ws.pageFilters = { ...ws.pageFilters, ...action.payload.filters };
    },

    clearPageFilters(state, action: PayloadAction<{ mapId: string }>) {
      workspace(state, action.payload.mapId).pageFilters = emptyMapPageFilters();
    },

    setCheckedPages(state, action: PayloadAction<{ mapId: string; ids: string[] }>) {
      workspace(state, action.payload.mapId).checkedPageIds = [
        ...new Set(action.payload.ids),
      ];
    },

    togglePageChecked(state, action: PayloadAction<{ mapId: string; id: string }>) {
      const ws = workspace(state, action.payload.mapId);
      const index = ws.checkedPageIds.indexOf(action.payload.id);
      if (index === -1) ws.checkedPageIds.push(action.payload.id);
      else ws.checkedPageIds.splice(index, 1);
    },

    setGraphFocus(state, action: PayloadAction<{ mapId: string; slug: string | null }>) {
      workspace(state, action.payload.mapId).graph.focusSlug = action.payload.slug;
    },

    setGraphEncodingMode(
      state,
      action: PayloadAction<{ mapId: string; mode: "structure" | "convergence" }>,
    ) {
      workspace(state, action.payload.mapId).graph.encodingMode = action.payload.mode;
    },

    setTableHierarchy(
      state,
      action: PayloadAction<{ mapId: string; hierarchy: boolean }>,
    ) {
      workspace(state, action.payload.mapId).table.hierarchy = action.payload.hierarchy;
    },

    /** `null` restores the `table_default_columns` knob's set — it never means "none". */
    setTableColumns(
      state,
      action: PayloadAction<{ mapId: string; columns: string[] | null }>,
    ) {
      workspace(state, action.payload.mapId).table.columns = action.payload.columns;
    },

    /**
     * Moves one or both review cursors. An OMITTED key is left alone; an
     * explicit `null` clears that cursor. `{ slug: null }` must be able to mean
     * "the topic deck is finished" without also throwing away where the page
     * deck was, which is why this reads `in` rather than `!== undefined` on a
     * merged object.
     */
    setReviewCursor(
      state,
      action: PayloadAction<{
        mapId: string;
        slug?: string | null;
        pageId?: string | null;
      }>,
    ) {
      const ws = workspace(state, action.payload.mapId);
      if ("slug" in action.payload) ws.review.cursorSlug = action.payload.slug ?? null;
      if ("pageId" in action.payload) {
        ws.review.cursorPageId = action.payload.pageId ?? null;
      }
    },

    setSiblingSort(
      state,
      action: PayloadAction<{ mapId: string; sort: MapSiblingSort }>,
    ) {
      workspace(state, action.payload.mapId).siblingSort = action.payload.sort;
    },

    /**
     * Drops one map's workspace. Called when a map is deleted, never on unmount.
     *
     * 🚨 THE SELECTOR CACHE IS NOT STATE, so this reducer cannot clear it — a
     * reducer that reached into a module-level Map would be a side effect in a
     * pure function. Whoever dispatches this ALSO calls
     * `evictMapSelectorCache(mapId)` from `./selectors`, which is where that
     * cache lives and the only file that may touch it (CONTRACTS §3, R16).
     */
    mapClosed(state, action: PayloadAction<{ mapId: string }>) {
      delete state.maps[action.payload.mapId];
    },
  },
});

/** Detaches `slug` from its parent and hangs it under `newParentSlug` (null = root). */
function reparent(
  ws: TopicalMapWorkspaceState,
  slug: string,
  newParentSlug: string | null,
): void {
  const topic = ws.topicsBySlug[slug];
  if (!topic) return;
  const oldParent = topic.parentSlug ? ws.topicsBySlug[topic.parentSlug] : null;
  if (oldParent) oldParent.childSlugs = oldParent.childSlugs.filter((s) => s !== slug);
  else ws.rootSlugs = ws.rootSlugs.filter((s) => s !== slug);

  topic.parentSlug = newParentSlug;
  if (newParentSlug) {
    const next = ws.topicsBySlug[newParentSlug];
    if (next && !next.childSlugs.includes(slug)) next.childSlugs.push(slug);
    restampDepth(ws.topicsBySlug, slug, (next?.depth ?? 0) + 1);
  } else {
    if (!ws.rootSlugs.includes(slug)) ws.rootSlugs.push(slug);
    restampDepth(ws.topicsBySlug, slug, 0);
  }
}

/** Renames a topic's key everywhere it is referenced. */
function rekey(ws: TopicalMapWorkspaceState, from: string, to: string): void {
  const topic = ws.topicsBySlug[from];
  if (!topic) return;
  delete ws.topicsBySlug[from];
  topic.slug = to;
  ws.topicsBySlug[to] = topic;
  for (const child of topic.childSlugs) {
    const childTopic = ws.topicsBySlug[child];
    if (childTopic) childTopic.parentSlug = to;
  }
  if (topic.parentSlug) {
    const parent = ws.topicsBySlug[topic.parentSlug];
    if (parent) parent.childSlugs = parent.childSlugs.map((s) => (s === from ? to : s));
  } else {
    ws.rootSlugs = ws.rootSlugs.map((s) => (s === from ? to : s));
  }
  ws.expandedSlugs = ws.expandedSlugs.map((s) => (s === from ? to : s));
  ws.checkedSlugs = ws.checkedSlugs.map((s) => (s === from ? to : s));
  if (ws.selectedSlug === from) ws.selectedSlug = to;
}

export const {
  mapOpened,
  mapTreeLoaded,
  topicLayoutLoaded,
  selectTopic,
  setCheckedTopics,
  toggleTopicChecked,
  toggleExpanded,
  setExpanded,
  revealTopic,
  expandAll,
  collapseAll,
  setView,
  setFilters,
  clearFilters,
  setSiteId,
  setGroupBy,
  pageIntentsLoaded,
  optimisticPatch,
  optimisticMove,
  optimisticLayout,
  optimisticCommitted,
  optimisticRolledBack,
  setPageFilters,
  clearPageFilters,
  setCheckedPages,
  togglePageChecked,
  setGraphFocus,
  setGraphEncodingMode,
  setTableHierarchy,
  setTableColumns,
  setReviewCursor,
  setSiblingSort,
  mapClosed,
} = topicalMapSlice.actions;

export default topicalMapSlice.reducer;
