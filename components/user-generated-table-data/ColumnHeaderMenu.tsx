"use client";

import React, { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowDown,
  ArrowUp,
  Filter,
  ListX,
  Loader2,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { getColumnFacets } from "@/features/data-tables/service";
import {
  defaultFilterMode,
  emptyFilter,
  isActiveFilter,
  type ColumnFilter,
} from "@/features/data-tables/column-filters";
import { isServiceFailure, type ColumnFacets } from "@/features/data-tables/types";

interface ColumnHeaderMenuProps {
  tableId: string;
  fieldName: string;
  displayName: string;
  dataType: string;
  /** True when this column is the active sort column. */
  isSorted: boolean;
  sortDirection: "asc" | "desc";
  filter: ColumnFilter | undefined;
  /** The table's active global search, so facet counts describe visible rows. */
  searchTerm?: string;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onClearSort: () => void;
  onFilterChange: (next: ColumnFilter | undefined) => void;
  /**
   * Open the table's column settings focused on this column. Omitted on
   * read-only mounts.
   */
  onConfigure?: () => void;
  /**
   * Remove this column. Omitted on read-only mounts and on the last remaining
   * column. Goes through the same confirm + RPC as the settings dialog — there
   * is exactly one delete-column path.
   */
  onDelete?: () => void;
}

/**
 * Per-column header control — explicit sort plus a filter that offers the
 * column's ACTUAL VALUES to pick from.
 *
 * The old control was a single "Contains…" box, which required already knowing
 * what a column held. Across this platform 25% of populated columns hold twelve
 * or fewer distinct values, so for most columns the right control is a
 * checklist with counts — and the values that surprise you (the one-off typo,
 * the stray casing) are exactly the ones a text box hides.
 *
 * Three rules this control keeps:
 *
 *   1. FREE TEXT IS NEVER TAKEN AWAY. Every column can switch to "Match text
 *      instead"; the checklist is an addition, never a replacement.
 *   2. IT NEVER GUESSES SILENTLY. Facets load from the server over every row;
 *      while they load it says so, and if they fail it says that and falls back
 *      to text rather than showing an empty list that reads as "no values".
 *   3. EMPTY IS A VALUE. "(empty)" is a real, countable option — asking for the
 *      rows nobody filled in is one of the most common things anyone wants.
 */
const ColumnHeaderMenu = ({
  tableId,
  fieldName,
  displayName,
  dataType,
  isSorted,
  sortDirection,
  filter,
  searchTerm,
  onSortAsc,
  onSortDesc,
  onClearSort,
  onFilterChange,
  onConfigure,
  onDelete,
}: ColumnHeaderMenuProps) => {
  const hasFilter = isActiveFilter(filter);
  const [open, setOpen] = useState(false);
  const [facets, setFacets] = useState<ColumnFacets | null>(null);
  const [facetError, setFacetError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [valueQuery, setValueQuery] = useState("");

  // Facets load when the menu OPENS, never on mount: a 20-column table would
  // otherwise fire 20 aggregate queries to render a header row nobody clicked.
  //
  // The guard is an ATTEMPT KEY, not "do I have facets yet". Guarding on the
  // result means a FAILED load leaves the preconditions unchanged, the effect
  // re-runs, and it retries forever — a request storm that exhausts the
  // browser's socket pool and takes the whole page down with it. Ask once per
  // (column, search) per open; a retry is the user's explicit choice.
  const attemptRef = useRef<string | null>(null);
  const attemptKey = `${tableId}::${fieldName}::${searchTerm ?? ""}`;

  useEffect(() => {
    if (!open) {
      // Reopening after the data changed must not show stale counts, and must
      // be allowed to try again after a failure.
      attemptRef.current = null;
      setFacets(null);
      setFacetError(null);
      return undefined;
    }
    if (attemptRef.current === attemptKey) return undefined;
    attemptRef.current = attemptKey;

    let cancelled = false;
    setLoading(true);
    setFacetError(null);
    void getColumnFacets({ tableId, fieldName, limit: 200, searchTerm })
      .then((result) => {
        if (cancelled) return;
        if (isServiceFailure(result)) setFacetError(result.error);
        else setFacets(result.data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFacetError(
          err instanceof Error ? err.message : "Could not read this column.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, attemptKey, tableId, fieldName, searchTerm]);

  const mode: ColumnFilter["mode"] =
    filter?.mode ??
    (facets
      ? defaultFilterMode({
          dataType,
          distinctCount: facets.distinct_count,
          maxLength: facets.max_length,
        })
      : "text");

  const setMode = (next: ColumnFilter["mode"]) => onFilterChange(emptyFilter(next));

  const values = facets?.values ?? [];
  const shownValues = valueQuery.trim()
    ? values.filter((v) =>
        v.value.toLowerCase().includes(valueQuery.trim().toLowerCase()),
      )
    : values;

  const selected = filter?.mode === "values" ? filter.values : [];
  const selectedSet = new Set(selected.map((s) => s.toLowerCase()));
  const includeBlank = filter?.mode === "values" ? filter.includeBlank : false;
  const negate = filter?.mode === "values" ? filter.negate : false;

  const toggleValue = (value: string) => {
    const already = selectedSet.has(value.toLowerCase());
    const nextValues = already
      ? selected.filter((s) => s.toLowerCase() !== value.toLowerCase())
      : [...selected, value];
    onFilterChange({
      mode: "values",
      values: nextValues,
      includeBlank,
      negate,
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "h-6 w-6 flex-shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
            (hasFilter || isSorted) && "text-primary",
          )}
          title={`Sort or filter ${displayName}`}
        >
          <Filter className={cn("h-3.5 w-3.5", hasFilter && "fill-current")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-2 px-1 pb-2">
          <p className="truncate text-sm font-semibold text-foreground" title={displayName}>
            {displayName}
          </p>
          {facets && (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {facets.distinct_count} distinct
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <Button
            variant={isSorted && sortDirection === "asc" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 justify-start gap-2 px-2 text-xs font-normal"
            onClick={onSortAsc}
          >
            <ArrowUp className="h-3.5 w-3.5" />
            Sort ascending
          </Button>
          <Button
            variant={isSorted && sortDirection === "desc" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 justify-start gap-2 px-2 text-xs font-normal"
            onClick={onSortDesc}
          >
            <ArrowDown className="h-3.5 w-3.5" />
            Sort descending
          </Button>
          {isSorted && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 justify-start gap-2 px-2 text-xs font-normal text-muted-foreground"
              onClick={onClearSort}
            >
              <ListX className="h-3.5 w-3.5" />
              Clear sort
            </Button>
          )}
        </div>

        <div className="my-2 h-px bg-border" />

        <div className="px-1">
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Filter
            </label>
            {hasFilter && (
              <button
                type="button"
                onClick={() => onFilterChange(undefined)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {loading && !facets && (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Reading this column&rsquo;s values…
            </div>
          )}

          {facetError && (
            <p className="mb-1.5 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
              Couldn&rsquo;t read this column&rsquo;s values, so there&rsquo;s no
              list to pick from. Text matching still works.
            </p>
          )}

          {mode === "values" && facets && (
            <div className="flex flex-col gap-1.5">
              {facets.truncated && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Showing the {values.length} most common of{" "}
                  {facets.distinct_count}. Use text matching for the rest.
                </p>
              )}

              {values.length > 8 && (
                <Input
                  value={valueQuery}
                  onChange={(e) => setValueQuery(e.target.value)}
                  placeholder="Search values…"
                  className="h-7 text-xs"
                  style={{ fontSize: "16px" }}
                />
              )}

              <div className="max-h-56 overflow-y-auto pr-0.5">
                {shownValues.map((entry) => (
                  <label
                    key={entry.value}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={selectedSet.has(entry.value.toLowerCase())}
                      onCheckedChange={() => toggleValue(entry.value)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="min-w-0 flex-1 truncate" title={entry.value}>
                      {entry.value}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {entry.count}
                    </span>
                  </label>
                ))}

                {shownValues.length === 0 && (
                  <p className="px-1 py-2 text-xs text-muted-foreground">
                    No value matches &ldquo;{valueQuery.trim()}&rdquo;.
                  </p>
                )}
              </div>

              {/* Empty is a first-class option: "which rows did nobody fill in"
                  is one of the most common questions asked of a table. */}
              {facets.blank > 0 && (
                <label className="flex cursor-pointer items-center gap-2 rounded border-t border-border px-1 pt-1.5 text-sm hover:bg-accent">
                  <Checkbox
                    checked={includeBlank}
                    onCheckedChange={(checked) =>
                      onFilterChange({
                        mode: "values",
                        values: selected,
                        includeBlank: checked === true,
                        negate,
                      })
                    }
                    className="h-3.5 w-3.5"
                  />
                  <span className="flex-1 italic text-muted-foreground">(empty)</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {facets.blank}
                  </span>
                </label>
              )}

              {(selected.length > 0 || includeBlank) && (
                <label className="flex cursor-pointer items-center gap-2 px-1 text-xs text-muted-foreground">
                  <Checkbox
                    checked={negate}
                    onCheckedChange={(checked) =>
                      onFilterChange({
                        mode: "values",
                        values: selected,
                        includeBlank,
                        negate: checked === true,
                      })
                    }
                    className="h-3.5 w-3.5"
                  />
                  Exclude these instead
                </label>
              )}
            </div>
          )}

          {mode === "range" && (
            <div className="flex items-center gap-1.5">
              <Input
                value={filter?.mode === "range" ? filter.min : ""}
                onChange={(e) =>
                  onFilterChange({
                    mode: "range",
                    min: e.target.value,
                    max: filter?.mode === "range" ? filter.max : "",
                  })
                }
                placeholder="From"
                className="h-8 text-sm"
                style={{ fontSize: "16px" }}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                value={filter?.mode === "range" ? filter.max : ""}
                onChange={(e) =>
                  onFilterChange({
                    mode: "range",
                    min: filter?.mode === "range" ? filter.min : "",
                    max: e.target.value,
                  })
                }
                placeholder="To"
                className="h-8 text-sm"
                style={{ fontSize: "16px" }}
              />
            </div>
          )}

          {mode === "text" && (
            <div className="relative">
              <Input
                autoFocus
                value={filter?.mode === "text" ? filter.text : ""}
                onChange={(e) =>
                  onFilterChange({ mode: "text", text: e.target.value })
                }
                placeholder="Contains…"
                className="h-8 pr-7 text-sm"
                style={{ fontSize: "16px" }}
              />
              {filter?.mode === "text" && filter.text !== "" && (
                <button
                  type="button"
                  onClick={() => onFilterChange(undefined)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  title="Clear filter"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Free text is never taken away — the picker is an addition. */}
          {facets && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px]">
              {mode !== "values" && facets.distinct_count > 0 && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setMode("values")}
                >
                  Pick from values
                </button>
              )}
              {mode !== "text" && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setMode("text")}
                >
                  Match text instead
                </button>
              )}
              {mode !== "range" && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setMode("range")}
                >
                  Use a range
                </button>
              )}
            </div>
          )}
        </div>

        {(onConfigure || onDelete) && (
          <>
            <div className="my-2 h-px bg-border" />
            <div className="flex flex-col gap-1">
              {onConfigure && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-start gap-2 px-2 text-xs font-normal"
                  onClick={onConfigure}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Column settings
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-start gap-2 px-2 text-xs font-normal text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove column
                </Button>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default ColumnHeaderMenu;
