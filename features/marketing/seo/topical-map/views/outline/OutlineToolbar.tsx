"use client";

/**
 * views/outline/OutlineToolbar.tsx — the one row above the tree: find, sort
 * siblings, expand/collapse all, and (only when the map has any) "Proposed
 * only".
 *
 * EVERYTHING HERE WRITES TO THE SLICE, nothing to component state that
 * matters: the filter text, the sibling sort and the expansion set all live
 * in the workspace, so switching to the table and back finds the outline
 * exactly as it was left (FEATURE.md § "Selection and expansion belong to the
 * slice"). The only local state is the un-debounced keystroke buffer.
 */

import { useEffect, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Search, X } from "lucide-react";

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import {
  selectMapFilters,
  selectMapSiblingSort,
  selectMapTotals,
} from "../../redux/selectors";
import { collapseAll, expandAll, setFilters, setSiblingSort } from "../../redux/slice";
import type { MapSiblingSort } from "../../redux/types";

/** How long a keystroke waits before the filter runs against the whole tree. */
export const OUTLINE_SEARCH_DEBOUNCE_MS = 150;

const SORT_LABELS: Record<MapSiblingSort, string> = {
  sort_order: "Map order",
  name: "Name",
  pages: "Pages",
  keywords: "Keywords",
  planned: "Planned",
};
const SORT_VALUES = Object.keys(SORT_LABELS) as MapSiblingSort[];

function isSiblingSort(value: string): value is MapSiblingSort {
  return (SORT_VALUES as string[]).includes(value);
}

export interface OutlineToolbarProps {
  mapId: string;
  /** Topic rows currently visible, for the "N of M" readout while filtering. */
  visibleTopics: number;
  className?: string;
}

export function OutlineToolbar({ mapId, visibleTopics, className }: OutlineToolbarProps) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector(selectMapFilters(mapId));
  const sort = useAppSelector(selectMapSiblingSort(mapId));
  const totals = useAppSelector(selectMapTotals(mapId));

  const [draft, setDraft] = useState(filters.text);

  // Keystrokes land in `draft`; the slice sees them after a short pause so a
  // 50-topic tree is not re-walked on every letter.
  useEffect(() => {
    if (draft === filters.text) return;
    const timer = window.setTimeout(() => {
      dispatch(setFilters({ mapId, filters: { text: draft } }));
    }, OUTLINE_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [dispatch, mapId, draft, filters.text]);

  const filtering =
    filters.text !== "" ||
    filters.statuses.length > 0 ||
    Object.keys(filters.facets).length > 0 ||
    filters.onlyWithPages ||
    filters.onlyGaps;
  const proposedOnly = filters.statuses.length === 1 && filters.statuses[0] === "proposed";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Find a topic…"
          aria-label="Find a topic"
          className="h-8 pl-7 pr-7 text-sm"
        />
        {draft ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setDraft("");
              dispatch(setFilters({ mapId, filters: { text: "" } }));
            }}
            className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {filtering ? (
        <span className="text-[11px] tabular-nums text-muted-foreground" aria-live="polite">
          {visibleTopics} of {totals.topicsLoaded} topics
        </span>
      ) : null}

      <Select
        value={sort}
        onValueChange={(value) => {
          if (isSiblingSort(value)) dispatch(setSiblingSort({ mapId, sort: value }));
        }}
      >
        <SelectTrigger className="h-8 w-[8.5rem] text-xs" aria-label="Order siblings by">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_VALUES.map((value) => (
            <SelectItem key={value} value={value} className="text-xs">
              {SORT_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {totals.proposed > 0 ? (
        <Button
          type="button"
          size="sm"
          variant={proposedOnly ? "secondary" : "ghost"}
          aria-pressed={proposedOnly}
          className="h-8 text-xs"
          onClick={() =>
            dispatch(
              setFilters({
                mapId,
                filters: { statuses: proposedOnly ? [] : ["proposed"] },
              }),
            )
          }
        >
          Proposed only
          <span className="ml-1 tabular-nums text-muted-foreground">{totals.proposed}</span>
        </Button>
      ) : null}

      <div className="ml-auto flex items-center gap-0.5">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          title="Expand all"
          aria-label="Expand all"
          onClick={() => dispatch(expandAll({ mapId }))}
        >
          <ChevronsUpDown className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          title="Collapse all"
          aria-label="Collapse all"
          onClick={() => dispatch(collapseAll({ mapId }))}
        >
          <ChevronsDownUp className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
