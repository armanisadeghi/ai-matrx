"use client";

/**
 * The ruling desk — browse, search, and sort every GSC-active keyword, open
 * any row into its receipt (the full why-chain), and issue rulings singly or
 * in bulk. Server-paged through gsc_keyword_value_review; the desk never
 * re-derives a band client-side — it renders what the resolver said.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Gavel,
  Inbox,
  Loader2,
  RotateCcw,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableLoadingComponent } from "@/components/matrx/LoadingComponents";
import type {
  ValueBandDef,
  ValueReviewQuery,
  ValueReviewRow,
  ValueSource,
} from "../../types";
import { bandColorClasses, bandLabel, compact } from "./lib";
import { ReasonReceipt } from "./ReasonReceipt";
import { RulingMenu } from "./RulingMenu";
import type { RulingInput } from "./useLedgerData";

const PAGE_SIZE = 50;

const SOURCE_FILTERS: Array<{ value: ValueSource | null; label: string }> = [
  { value: null, label: "Everything" },
  { value: "override", label: "Ruled by you" },
  { value: "computed", label: "Computed" },
  { value: "unvalued", label: "Unvalued" },
];

const SORTS: Array<{ value: NonNullable<ValueReviewQuery["sort"]>; label: string }> = [
  { value: "clicks", label: "Most clicks" },
  { value: "impressions", label: "Most impressions" },
  { value: "score", label: "Highest score" },
  { value: "keyword", label: "A to Z" },
];

function SourceGlyph({ source }: { source: ValueSource }) {
  if (source === "override")
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"
        title="You ruled this yourself — your ruling beats the arithmetic"
      >
        <Gavel className="h-3 w-3" /> yours
      </span>
    );
  if (source === "computed")
    return (
      <span
        className="text-[11px] text-muted-foreground"
        title="Computed from your topic worth, rules, and geo areas — open the row to see the arithmetic"
      >
        computed
      </span>
    );
  return (
    <span
      className="text-[11px] italic text-muted-foreground"
      title="Nothing you've defined applies yet — this keyword is waiting for you"
    >
      awaiting you
    </span>
  );
}

export interface DeskFilters {
  band: string | null;
  source: ValueSource | null;
  search: string;
  sort: NonNullable<ValueReviewQuery["sort"]>;
  sortDir: "asc" | "desc";
  page: number;
}

export const DEFAULT_FILTERS: DeskFilters = {
  band: null,
  source: null,
  search: "",
  sort: "clicks",
  sortDir: "desc",
  page: 0,
};

export function RulingDesk({
  rows,
  total,
  isLoading,
  isFetching,
  error,
  onRetry,
  vocab,
  filters,
  onFilters,
  onRule,
  rulingPending,
}: {
  rows: ValueReviewRow[] | undefined;
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  onRetry: () => void;
  vocab: ValueBandDef[];
  filters: DeskFilters;
  onFilters: (next: DeskFilters) => void;
  onRule: (input: RulingInput) => void;
  rulingPending: boolean;
}) {
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Debounced search → server. Refs keep the timer keyed on the draft alone.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const onFiltersRef = useRef(onFilters);
  onFiltersRef.current = onFilters;
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== filtersRef.current.search)
        onFiltersRef.current({ ...filtersRef.current, search: searchDraft, page: 0 });
    }, 350);
    return () => clearTimeout(t);
  }, [searchDraft]);

  // Selection only ever refers to visible rows.
  const visibleIds = useMemo(() => new Set((rows ?? []).map((r) => r.keyword_id)), [rows]);
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);

  const allSelected = (rows?.length ?? 0) > 0 && selected.size === rows?.length;
  const pageStart = filters.page * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + (rows?.length ?? 0), total);
  const sortMeta = SORTS.find((s) => s.value === filters.sort) ?? SORTS[0];

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rule = (ids: string[], tier: string | null, tierLabel?: string, notes?: string) => {
    onRule({ keywordIds: ids, tier, tierLabel, notes });
    setSelected(new Set());
  };

  return (
    <section aria-label="Ruling desk" className="relative">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search keywords…"
            className="h-8 pl-8 text-sm"
          />
          {searchDraft && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchDraft("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
          {SOURCE_FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => onFilters({ ...filters, source: f.value, page: 0 })}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                filters.source === f.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filters.band && (
          <button
            type="button"
            onClick={() => onFilters({ ...filters, band: null, page: 0 })}
            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
          >
            {bandLabel(filters.band, vocab)} only
            <X className="h-3 w-3" />
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1 px-2.5 text-xs">
                {sortMeta.label}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SORTS.map((s) => (
                <DropdownMenuItem
                  key={s.value}
                  onClick={() => onFilters({ ...filters, sort: s.value, page: 0 })}
                  className="text-xs"
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label="Flip sort direction"
            onClick={() =>
              onFilters({
                ...filters,
                sortDir: filters.sortDir === "desc" ? "asc" : "desc",
                page: 0,
              })
            }
          >
            {filters.sortDir === "desc" ? (
              <ArrowDown className="h-3.5 w-3.5" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
        {isLoading ? (
          <TableLoadingComponent />
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-destructive">
              The keyword list could not be loaded.
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {error.message}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="p-10 text-center">
            {filters.search || filters.band || filters.source ? (
              <>
                <SearchX className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium text-foreground">
                  No keywords match this view
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setSearchDraft("");
                    onFilters({ ...DEFAULT_FILTERS });
                  }}
                >
                  Show everything
                </Button>
              </>
            ) : (
              <>
                <Inbox className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium text-foreground">
                  No search keywords in this period
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Google hasn&apos;t reported any queries for this site in the last
                  28 days, so there is nothing to value yet.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Header row (desktop) */}
            <div className="hidden items-center gap-3 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() =>
                  setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.keyword_id)))
                }
                aria-label="Select all on this page"
                className="h-3.5 w-3.5"
              />
              <span className="flex-1">Keyword</span>
              <span className="w-24">Worth</span>
              <span className="w-20">Decided by</span>
              <span className="w-20">Class</span>
              <span className="w-14 text-right">Clicks</span>
              <span className="w-16 text-right">Views</span>
              <span className="w-14" />
            </div>

            <ul className={isFetching ? "opacity-60 transition-opacity" : ""}>
              {rows.map((r) => {
                const color = bandColorClasses(r.value_band, vocab);
                const isOpen = expanded === r.keyword_id;
                const isSel = selected.has(r.keyword_id);
                return (
                  <li key={r.keyword_id} className="border-b border-border last:border-b-0">
                    <div
                      className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:flex-nowrap ${
                        isSel ? "bg-primary/5" : isOpen ? "bg-muted/40" : "hover:bg-muted/30"
                      }`}
                    >
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={() => toggleRow(r.keyword_id)}
                        aria-label={`Select ${r.keyword}`}
                        className="h-3.5 w-3.5"
                      />
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : r.keyword_id)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        title="Show why this keyword has this value"
                      >
                        <ChevronRight
                          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                        />
                        <span className="truncate text-sm text-foreground">{r.keyword}</span>
                      </button>
                      <span className="w-auto sm:w-24">
                        <span
                          className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold ${color.chip}`}
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color.swatch}`} />
                          <span className="truncate">{bandLabel(r.value_band, vocab)}</span>
                        </span>
                      </span>
                      <span className="w-auto sm:w-20">
                        <SourceGlyph source={r.value_source} />
                      </span>
                      <span
                        className="hidden w-20 truncate text-[11px] text-muted-foreground sm:block"
                        title="Traffic class — what kind of search this is (separate from worth)"
                      >
                        {r.traffic_class || "—"}
                      </span>
                      <span className="w-14 text-right font-mono text-xs tabular-nums text-foreground">
                        {compact(r.clicks)}
                      </span>
                      <span className="hidden w-16 text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
                        {compact(r.impressions)}
                      </span>
                      <span className="flex w-auto justify-end sm:w-14">
                        <RulingMenu
                          vocab={vocab}
                          currentBand={r.value_band}
                          isOverride={r.value_source === "override"}
                          pending={rulingPending}
                          onRule={(tier, tierLabel, notes) =>
                            rule([r.keyword_id], tier, tierLabel, notes)
                          }
                          onClear={() => rule([r.keyword_id], null)}
                        />
                      </span>
                    </div>
                    {isOpen && (
                      <div className="border-t border-dashed border-border bg-muted/20 px-4 py-3 pl-10">
                        <ReasonReceipt
                          reasons={r.reasons ?? []}
                          band={r.value_band}
                          score={r.value_score}
                          source={r.value_source}
                          vocab={vocab}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {pageStart + 1}–{pageEnd} of {total.toLocaleString()} keyword
                {total === 1 ? "" : "s"}
                {isFetching && <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin" />}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  aria-label="Previous page"
                  disabled={filters.page === 0 || isFetching}
                  onClick={() => onFilters({ ...filters, page: filters.page - 1 })}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  aria-label="Next page"
                  disabled={pageEnd >= total || isFetching}
                  onClick={() => onFilters({ ...filters, page: filters.page + 1 })}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bulk ruling bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-3 z-10 mt-3 flex items-center gap-2 rounded-xl border border-glass-edge bg-glass p-2 pl-3 shadow-glass backdrop-blur-glass backdrop-saturate-glass">
          <p className="text-sm font-medium text-foreground">
            {selected.size} keyword{selected.size === 1 ? "" : "s"} selected
          </p>
          <div className="ml-auto flex items-center gap-1.5">
            <RulingMenu
              vocab={vocab}
              pending={rulingPending}
              onRule={(tier, tierLabel, notes) => rule([...selected], tier, tierLabel, notes)}
              trigger={
                <Button size="sm" className="h-7 gap-1.5 text-xs">
                  {rulingPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Gavel className="h-3 w-3" />
                  )}
                  Rule all selected
                </Button>
              }
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={rulingPending}
              onClick={() => rule([...selected], null)}
              title="Remove your rulings on the selected keywords — they go back to computed or unvalued"
            >
              <RotateCcw className="h-3 w-3" />
              Clear rulings
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label="Deselect all"
              onClick={() => setSelected(new Set())}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
