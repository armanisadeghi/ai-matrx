"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
  computeColumnFacets,
  defaultFilterMode,
  emptyFilter,
  isActiveFilter,
  localFacetsAreComplete,
  type ColumnFilter,
} from "@/features/data-tables/column-filters";
import {
  isServiceFailure,
  type ColumnFacets,
  type ServiceResult,
} from "@/features/data-tables/types";

interface ColumnHeaderMenuProps {
  /**
   * The user-data table this column belongs to — the identity `getColumnFacets`
   * needs. OMIT IT on a non-`udt_*` grid (CMS collections, and anything else
   * that reuses this control): then `fetchFacets` decides where server-side
   * facets come from, and with neither, the control works from the rows the
   * browser already holds. See `sourceLabel` for what it says when it cannot
   * see every row.
   */
  tableId?: string;
  /**
   * Server-side facets for a grid that is not a `udt_*` table. Called only when
   * `localRows` does not cover `totalCount` — the local-data-first rule is the
   * same for every source. Return null (or throw) to fall back to text mode.
   */
  fetchFacets?: (args: {
    fieldName: string;
    searchTerm?: string;
    limit: number;
  }) => Promise<ColumnFacets | null>;
  fieldName: string;
  displayName: string;
  dataType: string;
  /** True when this column is the active sort column. */
  isSorted: boolean;
  sortDirection: "asc" | "desc";
  filter: ColumnFilter | undefined;
  /** The table's active global search, so facet counts describe visible rows. */
  searchTerm?: string;
  /**
   * Rows the browser ALREADY holds. When these cover the whole table the value
   * list is computed from them and no request is made at all.
   */
  localRows: readonly { data?: Record<string, unknown> | null }[];
  /** Total rows after the active search — how we know whether `localRows` is all of them. */
  totalCount: number;
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
  fetchFacets,
  fieldName,
  displayName,
  dataType,
  isSorted,
  sortDirection,
  filter,
  searchTerm,
  localRows,
  totalCount,
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

  const attemptRef = useRef<string | null>(null);
  const attemptKey = `${tableId ?? "local"}::${fieldName}::${searchTerm ?? ""}`;

  /**
   * Can this mount answer "what is in this column" over rows it cannot see?
   * A `udt_*` table can (the RPC); another source can only if it supplied
   * `fetchFacets`. When neither holds, the menu says so instead of showing a
   * value list computed from one page — a partial checklist reads as the whole
   * column, which is the exact lie the facet RPC was built to stop.
   */
  const canFetchFacets = Boolean(fetchFacets) || Boolean(tableId);

  // LOCAL DATA FIRST. Most tables are small enough that every row is already in
  // memory, and then "what values are in this column" is a loop over an array —
  // instant, offline-safe, no spinner, no request. Asking the server for an
  // answer the browser already has is pure waste.
  //
  // The RPC runs ONLY when we genuinely do not hold every row, because counts
  // derived from a partial set would look authoritative and be wrong.
  const haveAllRows = localFacetsAreComplete(localRows.length, totalCount);

  const localFacets = useMemo(
    () =>
      haveAllRows
        ? computeColumnFacets({
            tableId: tableId ?? "local",
            fieldName,
            rows: localRows,
            limit: 200,
          })
        : null,
    [haveAllRows, tableId, fieldName, localRows],
  );

  // Fetched facets only ever fill the gap the local path cannot.
  useEffect(() => {
    if (!open || haveAllRows) return undefined;
    if (!canFetchFacets) return undefined;
    if (attemptRef.current === attemptKey) return undefined;
    attemptRef.current = attemptKey;

    let settled = false;
    setLoading(true);
    setFacetError(null);
    const request: Promise<ServiceResult<ColumnFacets>> = fetchFacets
      ? fetchFacets({ fieldName, searchTerm, limit: 200 }).then((data) =>
          data
            ? ({ data } as ServiceResult<ColumnFacets>)
            : ({ error: "Could not read this column." } as ServiceResult<ColumnFacets>),
        )
      : getColumnFacets({ tableId: tableId as string, fieldName, limit: 200, searchTerm });
    void request
      .then((result) => {
        settled = true;
        if (isServiceFailure(result)) setFacetError(result.error);
        else setFacets(result.data);
      })
      .catch((err: unknown) => {
        settled = true;
        setFacetError(
          err instanceof Error ? err.message : "Could not read this column.",
        );
      })
      .finally(() => {
        setLoading(false);
      });

    // THE CLEANUP MAY NOT CANCEL THE STATE UPDATE. An earlier version set a
    // `cancelled` flag here; when the effect merely RE-RAN (a dep re-fires, a
    // double-invoked mount), the in-flight callbacks were suppressed while the
    // attempt guard stopped a new fetch from starting — so `loading` stayed
    // true and the menu span forever. Clearing the attempt instead lets the
    // re-run legitimately try again, and a stale write is harmless because the
    // request is keyed to this exact column and search.
    return () => {
      if (!settled && attemptRef.current === attemptKey) {
        attemptRef.current = null;
      }
    };
  }, [open, haveAllRows, canFetchFacets, attemptKey, tableId, fetchFacets, fieldName, searchTerm]);

  // Closing resets so reopening after an edit never shows stale counts, and a
  // failed attempt is allowed to be retried.
  useEffect(() => {
    if (open) return;
    attemptRef.current = null;
    setFacets(null);
    setFacetError(null);
    setLoading(false);
    setValueQuery("");
  }, [open]);

  /** What the control actually renders from — local when we have it. */
  const effectiveFacets = localFacets ?? facets;

  const mode: ColumnFilter["mode"] =
    filter?.mode ??
    (effectiveFacets
      ? defaultFilterMode({
          dataType,
          distinctCount: effectiveFacets.distinct_count,
          maxLength: effectiveFacets.max_length,
        })
      : "text");

  const setMode = (next: ColumnFilter["mode"]) => onFilterChange(emptyFilter(next));

  const values = effectiveFacets?.values ?? [];
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
          {effectiveFacets && (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {effectiveFacets.distinct_count} distinct
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

          {loading && !effectiveFacets && (
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

          {/* NEVER show a checklist built from one page as if it were the
              column. A grid with no facet source and more rows than it holds
              says so and offers text matching, which IS complete because the
              server applies it. */}
          {!canFetchFacets && !haveAllRows && (
            <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">
              This column has more rows than are loaded, so there&rsquo;s no
              complete value list to pick from. Text matching still works.
            </p>
          )}

          {mode === "values" && effectiveFacets && (
            <div className="flex flex-col gap-1.5">
              {effectiveFacets.truncated && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Showing the {values.length} most common of{" "}
                  {effectiveFacets.distinct_count}. Use text matching for the rest.
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
              {effectiveFacets.blank > 0 && (
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
                    {effectiveFacets.blank}
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
          {effectiveFacets && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px]">
              {mode !== "values" && effectiveFacets.distinct_count > 0 && (
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
