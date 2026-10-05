// components/official/content-editor/ContentEditorBrowser.tsx
"use client";

import React, { useMemo, useState } from "react";
import { Search, X, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ContentEditorList,
  type ContentEditorListItem,
  type ContentEditorListProps,
} from "./ContentEditorList";
import {
  ContentEditorTree,
  type ContentEditorTreeNode,
  type ContentEditorTreeProps,
} from "./ContentEditorTree";

export interface ContentEditorFilter {
  id: string;
  label: string;
  /** Optional accent color for the chip when active. */
  tone?: "emerald" | "blue" | "amber" | "violet" | "zinc";
}

// ────────────────────────────────────────────────────────────
// Filter utilities (exported so external code can reuse)
// ────────────────────────────────────────────────────────────

const normalize = (s: string) => s.toLowerCase();

export function filterListItems<T extends ContentEditorListItem>(
  items: T[],
  query: string,
): T[] {
  const q = normalize(query.trim());
  if (!q) return items;
  return items.filter((item) => {
    const hay = `${item.title} ${item.description ?? ""}`;
    return normalize(hay).includes(q);
  });
}

/**
 * Filters a tree by a query. A folder is kept if itself matches OR any of its
 * descendants match. Non-matching siblings are dropped, preserving structure.
 */
export function filterTreeNodes<T extends ContentEditorTreeNode>(
  nodes: T[],
  query: string,
): T[] {
  const q = normalize(query.trim());
  if (!q) return nodes;

  const matches = (n: T) =>
    normalize(`${n.title} ${n.description ?? ""}`).includes(q);

  const walk = (ns: T[]): T[] => {
    const out: T[] = [];
    for (const n of ns) {
      if (n.children !== undefined) {
        const filteredChildren = walk(n.children as T[]);
        if (filteredChildren.length > 0 || matches(n)) {
          out.push({ ...n, children: filteredChildren } as T);
        }
      } else if (matches(n)) {
        out.push(n);
      }
    }
    return out;
  };

  return walk(nodes);
}

/** Collects every folder id in a tree (useful for auto-expanding during search). */
export function collectFolderIds(nodes: ContentEditorTreeNode[]): string[] {
  const out: string[] = [];
  const walk = (ns: ContentEditorTreeNode[]) => {
    for (const n of ns) {
      if (n.children !== undefined) {
        out.push(n.id);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}

// ────────────────────────────────────────────────────────────
// Browser shell
// ────────────────────────────────────────────────────────────

const toneClasses: Record<NonNullable<ContentEditorFilter["tone"]>, string> = {
  emerald: "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600",
  blue: "bg-blue-500 text-white border-blue-500 hover:bg-blue-600",
  amber: "bg-amber-500 text-white border-amber-500 hover:bg-amber-600",
  violet: "bg-violet-500 text-white border-violet-500 hover:bg-violet-600",
  zinc: "bg-zinc-700 text-white border-zinc-700 hover:bg-zinc-800",
};

interface BrowserHeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  placeholder?: string;
  filters?: ContentEditorFilter[];
  activeFilterIds?: string[];
  onActiveFiltersChange?: (ids: string[]) => void;
  title?: string;
}

function BrowserHeader({
  query,
  onQueryChange,
  placeholder = "Search…",
  filters,
  activeFilterIds = [],
  onActiveFiltersChange,
  title,
}: BrowserHeaderProps) {
  const toggleFilter = (id: string) => {
    if (!onActiveFiltersChange) return;
    onActiveFiltersChange(
      activeFilterIds.includes(id)
        ? activeFilterIds.filter((x) => x !== id)
        : [...activeFilterIds, id],
    );
  };

  return (
    <div className="flex-none border-b border-border bg-zinc-50 dark:bg-zinc-900/60">
      {title && (
        <div className="px-3 pt-2 pb-1 type-secondary font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {title}
        </div>
      )}

      {/* Search */}
      <div className="relative px-2 py-2">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-7 pr-7 py-1 text-xs rounded bg-white dark:bg-zinc-950 border border-border focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 placeholder:text-zinc-400"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center h-4 w-4 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"
            title="Clear"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Filter chips */}
      {filters && filters.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap px-2 pb-2">
          <ListFilter className="h-3 w-3 text-zinc-400" />
          {filters.map((f) => {
            const isActive = activeFilterIds.includes(f.id);
            const tone = toneClasses[f.tone ?? "zinc"];
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleFilter(f.id)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                  isActive
                    ? tone
                    : "bg-transparent text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Public component
// ────────────────────────────────────────────────────────────

interface BaseBrowserProps {
  title?: string;
  searchPlaceholder?: string;
  filters?: ContentEditorFilter[];
  activeFilterIds?: string[];
  onActiveFiltersChange?: (ids: string[]) => void;
  /**
   * Called to decide whether an item passes the currently-active filter set.
   * If omitted, filters do not affect results (they're display-only).
   */
  filterPredicate?: (
    item: ContentEditorListItem,
    activeFilterIds: string[],
  ) => boolean;

  className?: string;
  contentClassName?: string;

  /** Initial / controlled search query. */
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (q: string) => void;
  /** If true, auto-expand all folders while search query is non-empty (tree only). */
  autoExpandOnSearch?: boolean;
}

export interface ContentEditorListBrowserProps
  extends
    BaseBrowserProps,
    Omit<ContentEditorListProps, "items" | "title" | "className"> {
  variant: "list";
  items: ContentEditorListItem[];
}

export interface ContentEditorTreeBrowserProps
  extends
    BaseBrowserProps,
    Omit<
      ContentEditorTreeProps,
      "nodes" | "title" | "className" | "expandedIds" | "defaultExpandedIds"
    > {
  variant: "tree";
  nodes: ContentEditorTreeNode[];
  defaultExpandedIds?: string[];
  expandedIds?: string[];
}

export type ContentEditorBrowserProps =
  | ContentEditorListBrowserProps
  | ContentEditorTreeBrowserProps;

export function ContentEditorBrowser(props: ContentEditorBrowserProps) {
  const {
    title,
    searchPlaceholder,
    filters,
    activeFilterIds: controlledFilterIds,
    onActiveFiltersChange,
    filterPredicate,
    className,
    contentClassName,
    query: controlledQuery,
    defaultQuery = "",
    onQueryChange,
    autoExpandOnSearch = true,
  } = props;

  const [internalQuery, setInternalQuery] = useState(defaultQuery);
  const [internalFilterIds, setInternalFilterIds] = useState<string[]>([]);

  const query = controlledQuery ?? internalQuery;
  const activeFilterIds = controlledFilterIds ?? internalFilterIds;

  const handleQueryChange = (q: string) => {
    if (controlledQuery === undefined) setInternalQuery(q);
    onQueryChange?.(q);
  };

  const handleFilterChange = (ids: string[]) => {
    if (controlledFilterIds === undefined) setInternalFilterIds(ids);
    onActiveFiltersChange?.(ids);
  };

  // Apply filter predicate across list/tree items uniformly.
  const applyFilterPredicate = <T extends ContentEditorListItem>(item: T) => {
    if (!filterPredicate || activeFilterIds.length === 0) return true;
    return filterPredicate(item, activeFilterIds);
  };

  const body = useMemo(() => {
    if (props.variant === "list") {
      const { items, variant: _variant, ...listRest } = props;
      const searched = filterListItems(items, query);
      const final = searched.filter(applyFilterPredicate);
      return <ContentEditorList {...listRest} items={final} />;
    }

    const {
      nodes,
      variant: _variant,
      expandedIds,
      defaultExpandedIds,
      ...treeRest
    } = props;

    // Filter tree by query
    const searchedNodes = filterTreeNodes(nodes, query);

    // Filter tree by active filters (applied only to leaves; folders are kept
    // if any descendant passes).
    const leavesPass = (
      n: ContentEditorTreeNode,
    ): ContentEditorTreeNode | null => {
      if (n.children !== undefined) {
        const kids = n.children
          .map(leavesPass)
          .filter(Boolean) as ContentEditorTreeNode[];
        if (kids.length === 0 && !applyFilterPredicate(n)) return null;
        return { ...n, children: kids };
      }
      return applyFilterPredicate(n) ? n : null;
    };
    const filtered =
      activeFilterIds.length > 0 && filterPredicate
        ? (searchedNodes
            .map(leavesPass)
            .filter(Boolean) as ContentEditorTreeNode[])
        : searchedNodes;

    // Auto-expand folders during active search so matches are visible.
    const autoExpanded =
      autoExpandOnSearch && query.trim().length > 0
        ? collectFolderIds(filtered)
        : undefined;

    return (
      <ContentEditorTree
        {...treeRest}
        nodes={filtered}
        expandedIds={autoExpanded ?? expandedIds}
        defaultExpandedIds={defaultExpandedIds}
      />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props, query, activeFilterIds]);

  return (
    <div
      className={cn(
        "flex flex-col bg-white dark:bg-zinc-900 border border-border rounded-lg overflow-hidden",
        className,
      )}
    >
      <BrowserHeader
        query={query}
        onQueryChange={handleQueryChange}
        placeholder={searchPlaceholder}
        filters={filters}
        activeFilterIds={activeFilterIds}
        onActiveFiltersChange={handleFilterChange}
        title={title}
      />
      <div className={cn("flex-1 overflow-auto", contentClassName)}>
        {/* Strip outer borders/rounding from the inner list/tree since the
            browser shell already owns the frame. */}
        <div className="[&>div]:border-0 [&>div]:rounded-none">{body}</div>
      </div>
    </div>
  );
}
