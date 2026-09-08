"use client";

// features/workflow-runtime/listings/useWorkflowListCore.ts
//
// The workflow picker's brain — the twin of `useAgentListCore`.
//
// TWO DELIBERATE DIFFERENCES FROM THE AGENT CORE, both because a workflow list
// is answered by an RPC rather than a redux catalogue:
//
//  1. THE SERVER FILTERS. Scope, search, sort, category/tag/favorite filters
//     and the tab counts are all arguments to `wfx_list_scoped` and its
//     siblings, so this hook holds the QUERY and re-reads when it changes —
//     it never filters a page in JS, which is how a picker starts lying about
//     totals the moment the set exceeds one page.
//  2. THE FILTER STATE IS LOCAL to the mounted picker. The agent list keeps
//     per-consumer state in redux because the same filters follow a user
//     across whole pages; a holder picker is one control on one screen, and a
//     new redux slice for it would be a layer nobody asked for.
//
// Everything else — the hover grace window, the pinned "current" row, the
// detail panel handoff — is the same behaviour, reusing the agent core's
// constant so the two can never drift apart by a number.

import { useCallback, useEffect, useRef, useState } from "react";

import { HOVER_GRACE_MS } from "@/features/agents/components/agent-listings/useAgentListCore";
import {
  fetchWorkflowPickerCounts,
  fetchWorkflowPickerFacets,
  fetchWorkflowPickerPage,
  fetchWorkflowRecordById,
  type WorkflowPickerQuery,
} from "./service";
import type {
  WorkflowListRecord,
  WorkflowSortOption,
  WorkflowTab,
} from "./types";

export interface WorkflowTabCounts {
  mine: number;
  orgs: number;
  shared: number;
  public: number;
}

const NO_COUNTS: WorkflowTabCounts = { mine: 0, orgs: 0, shared: 0, public: 0 };

export const DEFAULT_WORKFLOW_PICKER_QUERY: WorkflowPickerQuery = {
  tab: "mine",
  search: "",
  deep: false,
  includedCats: [],
  includedTags: [],
  favFilter: "all",
  archived: "active",
  sortBy: "updated-desc",
  favoritesFirst: true,
};

export interface UseWorkflowListCoreOptions {
  /** Currently assigned workflow — pinned above the list and highlighted. */
  activeWorkflowId?: string | null;
  /** Tab this picker opens on. Defaults to "mine". */
  initialTab?: WorkflowTab;
  /** Hard restriction: only these tabs may be reached, coerced on every change. */
  visibleTabs?: readonly WorkflowTab[];
  /** Records this call site may not offer. */
  excludeWorkflowIds?: readonly string[];
  onSelect?: (workflowId: string) => void;
}

export function useWorkflowListCore({
  activeWorkflowId = null,
  initialTab,
  visibleTabs,
  excludeWorkflowIds,
  onSelect,
}: UseWorkflowListCoreOptions) {
  const allowedTab = (tab: WorkflowTab): WorkflowTab => {
    if (!visibleTabs || visibleTabs.length === 0 || visibleTabs.includes(tab)) {
      return tab;
    }
    return visibleTabs.includes(initialTab ?? "mine")
      ? (initialTab ?? "mine")
      : visibleTabs[0];
  };

  const [query, setQuery] = useState<WorkflowPickerQuery>({
    ...DEFAULT_WORKFLOW_PICKER_QUERY,
    tab: allowedTab(initialTab ?? DEFAULT_WORKFLOW_PICKER_QUERY.tab),
  });
  const [records, setRecords] = useState<WorkflowListRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<WorkflowTabCounts>(NO_COUNTS);
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // 🚨 A read that fails SAYS SO. An empty list where an error happened reads
  // as "you have no workflows", which is the silent failure the fourth law
  // forbids; the content renders this sentence with a retry instead.
  const [readError, setReadError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [reloads, setReloads] = useState(0);

  const [hoveredWorkflow, setHoveredWorkflow] =
    useState<WorkflowListRecord | null>(null);
  const hoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Nothing is read until the picker is opened — same as the agent list. */
  const ensureLoaded = useCallback(() => setStarted(true), []);

  const queryKey = JSON.stringify(query);

  useEffect(() => {
    if (!started) return undefined;
    let live = true;
    setIsLoading(true);
    setReadError(null);
    void (async () => {
      try {
        const page = await fetchWorkflowPickerPage(query);
        if (!live) return;
        setRecords(page.records);
        setTotal(page.total);
      } catch (err: unknown) {
        if (!live) return;
        setRecords([]);
        setTotal(0);
        setReadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (live) setIsLoading(false);
      }
    })();
    return () => {
      live = false;
    };
    // The whole query is the dependency — one read per distinct question.
  }, [started, queryKey, reloads]);

  useEffect(() => {
    if (!started) return undefined;
    let live = true;
    void (async () => {
      try {
        const [scopeCounts, facets] = await Promise.all([
          fetchWorkflowPickerCounts(query),
          fetchWorkflowPickerFacets(query),
        ]);
        if (!live) return;
        setCounts({
          mine: scopeCounts.byKind.mine ?? 0,
          orgs: scopeCounts.byKind.orgs ?? 0,
          shared: scopeCounts.byKind.shared ?? 0,
          public: scopeCounts.byKind.public ?? 0,
        });
        setCategories(facets.categories);
        setTags(facets.tags);
      } catch {
        // Tab numbers and filter OPTIONS are decoration on a list that works.
        // The list's own failure is the one that gets said out loud, above.
      }
    })();
    return () => {
      live = false;
    };
  }, [started, queryKey, reloads]);

  const excluded = new Set(excludeWorkflowIds ?? []);
  const visible =
    excluded.size === 0
      ? records
      : records.filter((record) => !excluded.has(record.id));

  // 🚨 THE ASSIGNED RECORD IS NAMED WHETHER OR NOT THE FILTER CONTAINS IT.
  // The trigger of this picker IS the statement of what is assigned, so the
  // assigned workflow is resolved on its own read the moment an id arrives —
  // not only when it happens to fall inside the open tab. Without this, a
  // holder assigned from "Team" reads as unassigned the moment the picker
  // sits on "Mine".
  const [resolvedActive, setResolvedActive] =
    useState<WorkflowListRecord | null>(null);
  const inPage = activeWorkflowId
    ? (visible.find((record) => record.id === activeWorkflowId) ?? null)
    : null;

  useEffect(() => {
    if (!activeWorkflowId) {
      setResolvedActive(null);
      return undefined;
    }
    if (resolvedActive?.id === activeWorkflowId) return undefined;
    let live = true;
    void (async () => {
      try {
        const record = await fetchWorkflowRecordById(activeWorkflowId);
        if (live) setResolvedActive(record);
      } catch {
        // The picker still lists and still selects; the trigger falls back to
        // whatever name the host passed in.
      }
    })();
    return () => {
      live = false;
    };
  }, [activeWorkflowId, resolvedActive?.id]);

  const pinnedWorkflow = inPage ?? resolvedActive;
  const listed = pinnedWorkflow
    ? visible.filter((record) => record.id !== pinnedWorkflow.id)
    : visible;

  const activeFilterCount =
    (query.includedCats.length > 0 ? 1 : 0) +
    (query.includedTags.length > 0 ? 1 : 0) +
    (query.favFilter !== "all" ? 1 : 0) +
    (query.archived !== "active" ? 1 : 0) +
    (query.deep ? 1 : 0);

  const patch = useCallback((next: Partial<WorkflowPickerQuery>) => {
    setQuery((current) => ({ ...current, ...next }));
  }, []);

  const controls = {
    tab: query.tab,
    setTab: (tab: WorkflowTab) => patch({ tab: allowedTab(tab) }),
    searchTerm: query.search,
    setSearchTerm: (search: string) => patch({ search }),
    deepSearch: query.deep,
    setDeepSearch: (deep: boolean) => patch({ deep }),
    sortBy: query.sortBy,
    setSortBy: (sortBy: WorkflowSortOption) => patch({ sortBy }),
    includedCats: query.includedCats,
    toggleCategory: (value: string) =>
      patch({
        includedCats: query.includedCats.includes(value)
          ? query.includedCats.filter((v) => v !== value)
          : [...query.includedCats, value],
      }),
    includedTags: query.includedTags,
    toggleTag: (value: string) =>
      patch({
        includedTags: query.includedTags.includes(value)
          ? query.includedTags.filter((v) => v !== value)
          : [...query.includedTags, value],
      }),
    favFilter: query.favFilter,
    setFavFilter: (favFilter: "all" | "yes" | "no") => patch({ favFilter }),
    archived: query.archived,
    setArchived: (archived: "active" | "archived" | "all") =>
      patch({ archived }),
    favoritesFirst: query.favoritesFirst,
    setFavoritesFirst: (favoritesFirst: boolean) => patch({ favoritesFirst }),
    resetFilters: () =>
      setQuery((current) => ({
        ...DEFAULT_WORKFLOW_PICKER_QUERY,
        tab: current.tab,
        search: current.search,
      })),
  };

  const retry = useCallback(() => setReloads((n) => n + 1), []);

  /** Re-read after a write this picker made (favorite toggled, say). */
  const refresh = retry;

  const handleSelectWorkflow = useCallback(
    (record: WorkflowListRecord) => {
      onSelect?.(record.id);
    },
    [onSelect],
  );

  const handleWorkflowHover = useCallback(
    (record: WorkflowListRecord, filterPanelOpen: boolean) => {
      if (hoverLeaveTimerRef.current) {
        clearTimeout(hoverLeaveTimerRef.current);
        hoverLeaveTimerRef.current = null;
      }
      if (filterPanelOpen) return;
      setHoveredWorkflow(record);
    },
    [],
  );

  const handleWorkflowHoverEnd = useCallback(
    (record: WorkflowListRecord, closePanel: () => void) => {
      if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = setTimeout(() => {
        setHoveredWorkflow((current) =>
          current?.id === record.id ? null : current,
        );
        closePanel();
      }, HOVER_GRACE_MS);
    },
    [],
  );

  const handleDetailPanelMouseEnter = useCallback(() => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
  }, []);

  const handleDetailPanelMouseLeave = useCallback((closePanel: () => void) => {
    if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
    hoverLeaveTimerRef.current = setTimeout(() => {
      setHoveredWorkflow(null);
      closePanel();
    }, HOVER_GRACE_MS);
  }, []);

  useEffect(
    () => () => {
      if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
    },
    [],
  );

  return {
    workflows: listed,
    total,
    isLoading,
    readError,
    retry,
    refresh,
    counts,
    allCategories: categories,
    allTags: tags,
    controls,
    activeFilterCount,
    pinnedWorkflow,
    hoveredWorkflow,
    setHoveredWorkflow,
    ensureLoaded,
    handleSelectWorkflow,
    handleWorkflowHover,
    handleWorkflowHoverEnd,
    handleDetailPanelMouseEnter,
    handleDetailPanelMouseLeave,
  };
}

export type WorkflowListControls = ReturnType<
  typeof useWorkflowListCore
>["controls"];
