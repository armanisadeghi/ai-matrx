"use client";

/**
 * features/marketing/content-plan/components/PlanTreeToolbar.tsx
 *
 * Compact list-management strip for the plan tree pane: search (label /
 * route / slug, ancestors kept), multi-select filters (status, type, keyword
 * coverage, reviewer) behind ONE popover with an active-count badge,
 * sibling-level sort, expand/collapse-all plus the Pillars/Clusters/All
 * level control (the top-level overview), a live node count, and top-level
 * page creation. Commands are split into two stable bands so search stays
 * useful in a narrow tree pane. All state lives in PlanTree — this is chrome
 * only. Pure logic: ../lib/tree-view.ts.
 */
import { useState } from "react";
import {
  ArrowUpDown,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  ListFilter,
  Plus,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { NODE_TYPE_LABELS, planStatusColor } from "../constants";
import {
  countActiveTreeFilters,
  EMPTY_TREE_FILTERS,
  TREE_SORT_MODES,
  type KeywordCoverageFilter,
  type TreeFilters,
  type TreeLevel,
  type TreeSortMode,
} from "../lib/tree-view";
import { PLAN_NODE_TYPES, type PlanNodeType } from "../types";

export interface TreeStatusOption {
  id: string;
  name: string;
  slug: string | null;
  count: number;
}

export interface PlanTreeToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: TreeFilters;
  onFiltersChange: (next: TreeFilters) => void;
  sortMode: TreeSortMode;
  onSortModeChange: (mode: TreeSortMode) => void;
  statusOptions: readonly TreeStatusOption[];
  typeCounts: ReadonlyMap<string, number>;
  totalCount: number;
  /** Nodes matching the active query (equals totalCount when idle). */
  matchedCount: number;
  queryActive: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onLevel: (level: TreeLevel) => void;
  onAddRoot: () => void;
}

const KEYWORD_OPTIONS: { value: KeywordCoverageFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "has", label: "Has keyword" },
  { value: "missing", label: "Missing" },
];

const LEVEL_OPTIONS: { value: TreeLevel; label: string }[] = [
  { value: "pillars", label: "Pillars" },
  { value: "clusters", label: "Clusters" },
  { value: "all", label: "All" },
];

export function PlanTreeToolbar({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  sortMode,
  onSortModeChange,
  statusOptions,
  typeCounts,
  totalCount,
  matchedCount,
  queryActive,
  onExpandAll,
  onCollapseAll,
  onLevel,
  onAddRoot,
}: PlanTreeToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = countActiveTreeFilters(filters);
  const sortLabel =
    TREE_SORT_MODES.find((mode) => mode.id === sortMode)?.label ?? "Sort";

  const toggleStatus = (id: string) => {
    const next = filters.statusIds.includes(id)
      ? filters.statusIds.filter((value) => value !== id)
      : [...filters.statusIds, id];
    onFiltersChange({ ...filters, statusIds: next });
  };

  const toggleType = (type: PlanNodeType) => {
    const next = filters.nodeTypes.includes(type)
      ? filters.nodeTypes.filter((value) => value !== type)
      : [...filters.nodeTypes, type];
    onFiltersChange({ ...filters, nodeTypes: next });
  };

  return (
    <div className="shrink-0 border-b border-border bg-muted/15">
      <div className="flex items-center gap-1 px-1.5 py-1">
        {/* Search — label OR route OR slug, ancestors stay visible (dimmed). */}
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search pages…"
            aria-label="Search plan pages"
            className="h-7 border-border/70 bg-background/70 pl-6 pr-6 text-xs shadow-none"
            style={{ fontSize: "16px" }}
          />
          {search ? (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => onSearchChange("")}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        {/* Filters — one popover, active-count badge, one-click clear. */}
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={activeFilterCount > 0 ? "secondary" : "ghost"}
              size="sm"
              className="h-6 gap-1 px-1.5 text-xs"
              aria-label="Filter pages"
            >
              <ListFilter className="h-3.5 w-3.5" />
              {activeFilterCount > 0 ? (
                <span className="rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                Filters
              </span>
              {activeFilterCount > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[11px] text-muted-foreground"
                  onClick={() => onFiltersChange(EMPTY_TREE_FILTERS)}
                >
                  Clear all
                </Button>
              ) : null}
            </div>

            <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </p>
            <div className="mt-1 max-h-44 space-y-0.5 overflow-y-auto">
              {statusOptions.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs text-foreground hover:bg-accent/50"
                >
                  <Checkbox
                    checked={filters.statusIds.includes(option.id)}
                    onCheckedChange={() => toggleStatus(option.id)}
                    className="h-3.5 w-3.5"
                  />
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      planStatusColor(option.slug),
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {option.count}
                  </span>
                </label>
              ))}
            </div>

            <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Type
            </p>
            <div className="mt-1 space-y-0.5">
              {PLAN_NODE_TYPES.map((type) => (
                <label
                  key={type}
                  className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs text-foreground hover:bg-accent/50"
                >
                  <Checkbox
                    checked={filters.nodeTypes.includes(type)}
                    onCheckedChange={() => toggleType(type)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {NODE_TYPE_LABELS[type]}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {typeCounts.get(type) ?? 0}
                  </span>
                </label>
              ))}
            </div>

            <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Primary keyword
            </p>
            <div className="mt-1 flex gap-0.5">
              {KEYWORD_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={
                    filters.keyword === option.value ? "secondary" : "ghost"
                  }
                  size="sm"
                  className="h-6 flex-1 px-1 text-[11px]"
                  onClick={() =>
                    onFiltersChange({ ...filters, keyword: option.value })
                  }
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <label className="mt-2 flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs text-foreground hover:bg-accent/50">
              <Checkbox
                checked={filters.needsReviewer}
                onCheckedChange={(checked) =>
                  onFiltersChange({
                    ...filters,
                    needsReviewer: checked === true,
                  })
                }
                className="h-3.5 w-3.5"
              />
              Needs reviewer only
            </label>
          </PopoverContent>
        </Popover>

        {/* Sort — reorders siblings within each parent, never flattens. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={sortMode !== "tree" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 gap-1 px-1.5 text-xs"
              aria-label={`Sort: ${sortLabel}`}
              title={`Sort: ${sortLabel}`}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {TREE_SORT_MODES.map((mode) => (
              <DropdownMenuItem
                key={mode.id}
                className="gap-2 text-xs"
                onSelect={() => onSortModeChange(mode.id)}
              >
                <Check
                  className={cn(
                    "h-3.5 w-3.5",
                    sortMode === mode.id ? "opacity-100" : "opacity-0",
                  )}
                />
                {mode.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="whitespace-nowrap pl-1 text-[11px] tabular-nums text-muted-foreground">
          {queryActive
            ? `${matchedCount} of ${totalCount}`
            : `${totalCount} ${totalCount === 1 ? "page" : "pages"}`}
        </span>
      </div>

      <div className="scrollbar-hide flex items-center gap-1 overflow-x-auto border-t border-border/50 px-1.5 py-1">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Depth
        </span>

        {/* Level control — Pillars is THE top-level overview. */}
        <div className="flex shrink-0 overflow-hidden rounded border border-border bg-background/60">
          {LEVEL_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant="ghost"
              size="sm"
              className="h-6 rounded-none px-2 text-[11px]"
              onClick={() => onLevel(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 gap-1 px-1.5 text-[11px]"
          aria-label="Add top-level page"
          title="Add a top-level page"
          onClick={onAddRoot}
        >
          <Plus className="h-3.5 w-3.5" />
          Top level
        </Button>

        <span className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0"
          aria-label="Expand all"
          title="Expand all"
          onClick={onExpandAll}
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0"
          aria-label="Collapse all"
          title="Collapse all — Home and its first-tier pages stay visible"
          onClick={onCollapseAll}
        >
          <ChevronsDownUp className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
