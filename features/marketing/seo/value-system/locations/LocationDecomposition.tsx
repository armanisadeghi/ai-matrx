"use client";

/**
 * TRAFFIC, BY LOCATION (C10) — the decomposition, and the keywords behind
 * every row of it.
 *
 * P16: "companies that have multiple locations, the definition of local starts
 * to change… it's also about knowing WHICH location that one belongs to."
 *
 * TWO RULES THIS SCREEN OBEYS AND MOST DASHBOARDS DO NOT:
 *
 *  1. THE REMAINDER IS A ROW. "Local — location not resolved" and "Not
 *     location-specific" sit in the same list as the real branches, with the
 *     same numbers. A decomposition that quietly drops what it could not place
 *     is a claim of coverage it has not earned.
 *  2. EVERY ROW OPENS. Clicking one filters the keyword list below it to
 *     exactly the searches that make it up — server-paged, so a location's list
 *     is never silently cut off at some invisible ceiling. Each keyword then
 *     opens its own value receipt in a floating panel (P25: the reader never
 *     loses the view they built).
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md § C10.
 */

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Globe2,
  MapPinOff,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  ColumnFiltersState,
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import { useOpenGscWhyScoreWindow } from "@/features/overlays/openers/gscWhyScoreWindow";
import {
  getLocationKeywords,
  getLocationSummary,
  locationKeywordsQueryKey,
  locationSummaryQueryKey,
  type LocationKeywordsView,
  type LocationKeywordSort,
} from "./data";
import {
  decidedByChip,
  explainDecidedBy,
  type LocationBucket,
  type LocationKeywordRow,
  type LocationSummaryRow,
} from "./types";

const PAGE_SIZE = 25;

/**
 * The Attributed-by filter's options — the SAME `decided_by` values the RPC
 * accepts, in the reader's words. `unattributed` is the null bucket: the RPC
 * coalesces a missing answer to it, so "no answer yet" is filterable instead of
 * being a hole in the column.
 */
const DECIDED_BY_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  ...[
    "bound_area",
    "place_match",
    "state_match",
    "nearest_place",
    "single_location",
    "unresolved",
    "not_local",
  ].map((value) => ({ value, label: decidedByChip(value) })),
  /* The null bucket, offered by name. Most rows in the two explicit buckets
     carry no `decided_by` at all, and a filter that cannot express the value
     the column is FULL of is a control that does nothing. */
  { value: "unattributed", label: "no answer yet" },
];

const SORTABLE: Record<string, LocationKeywordSort> = {
  keyword: "keyword",
  clicks: "clicks",
  impressions: "impressions",
  decided_by: "decided_by",
};

/** The server view, rendered back as the table's own filter state. */
function toColumnFilters(view: LocationKeywordsView): ColumnFiltersState {
  const filters: ColumnFiltersState = {};
  if (view.decidedBy.length > 0)
    filters.decided_by = {
      kind: "select",
      value: view.decidedBy[0] ?? "",
      values: view.decidedBy,
    };
  if (view.clicksMin !== null || view.clicksMax !== null)
    filters.clicks = {
      kind: "number",
      ...(view.clicksMin === null ? {} : { min: view.clicksMin }),
      ...(view.clicksMax === null ? {} : { max: view.clicksMax }),
    };
  if (view.impressionsMin !== null || view.impressionsMax !== null)
    filters.impressions = {
      kind: "number",
      ...(view.impressionsMin === null ? {} : { min: view.impressionsMin }),
      ...(view.impressionsMax === null ? {} : { max: view.impressionsMax }),
    };
  return filters;
}

/**
 * The table's state, translated into the RPC's parameters. The Keyword column's
 * text filter and the toolbar's search box are the SAME server-side match, so
 * whichever the person used is what the RPC is asked for — a filter that
 * quietly did nothing would be the defect this conversion exists to remove.
 */
function nextView(
  current: LocationKeywordsView,
  next: MatrxDataTableQueryState,
): LocationKeywordsView {
  const filters = next.columnFilters ?? {};
  const keywordFilter = filters.keyword;
  const decidedFilter = filters.decided_by;
  const clicksFilter = filters.clicks;
  const impressionsFilter = filters.impressions;
  const typedSearch =
    keywordFilter?.kind === "text" ? keywordFilter.value.trim() : "";
  return {
    ...current,
    page: next.page,
    pageSize: next.pageSize,
    search: next.search.trim() || typedSearch,
    sort: SORTABLE[next.sort?.id ?? ""] ?? current.sort,
    sortDir: next.sort?.direction ?? current.sortDir,
    decidedBy:
      decidedFilter?.kind === "select"
        ? (decidedFilter.values ??
          (decidedFilter.value ? [decidedFilter.value] : []))
        : [],
    clicksMin: clicksFilter?.kind === "number" ? (clicksFilter.min ?? null) : null,
    clicksMax: clicksFilter?.kind === "number" ? (clicksFilter.max ?? null) : null,
    impressionsMin:
      impressionsFilter?.kind === "number"
        ? (impressionsFilter.min ?? null)
        : null,
    impressionsMax:
      impressionsFilter?.kind === "number"
        ? (impressionsFilter.max ?? null)
        : null,
  };
}

/** Signed delta against the compare window — never a bare "up". */
function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0 && now === 0) return null;
  const diff = now - before;
  if (diff === 0)
    return <span className="text-[10px] text-muted-foreground">flat</span>;
  return (
    <span
      className={cn(
        "text-[10px] tabular-nums",
        diff > 0 ? "text-success" : "text-destructive",
      )}
      title={`${formatCount(before)} in the previous 28 days`}
    >
      {diff > 0 ? "+" : "−"}
      {formatCount(Math.abs(diff))}
    </span>
  );
}

function RowIcon({ row }: { row: LocationSummaryRow }) {
  if (row.location_id)
    return <Building2 className="h-3.5 w-3.5 text-primary" aria-hidden />;
  if (row.decided_by === "unresolved")
    return <MapPinOff className="h-3.5 w-3.5 text-warning" aria-hidden />;
  return <Globe2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />;
}

/** What this row means, in one sentence, under its name. */
function rowSubtitle(row: LocationSummaryRow): string {
  if (row.location_id)
    return "Searches attributed to this location — open it to see exactly which.";
  if (row.decided_by === "unresolved")
    return "These searches name a place, but nothing yet says which location they belong to.";
  return "No place is named in these searches, so no location can own them.";
}

// ── The keywords behind one row ────────────────────────────────────────────

function LocationKeywords({
  siteId,
  brandId,
  locationId,
  bucket,
  locationName,
  start,
  end,
  windowLabel,
  comparedKeywords,
}: {
  siteId: string;
  brandId: string;
  locationId: string | null;
  bucket: LocationBucket | null;
  locationName: string;
  start: string;
  end: string;
  windowLabel: string;
  /** Keywords this row had in the COMPARE window — see the empty state below. */
  comparedKeywords: number;
}) {
  /**
   * P26 — ONE table. This list used to be a hand-rolled <ul> with a
   * Previous/Next pair: 900 keywords you could page through and never sort.
   * It is the canonical table now, in CONTROLLED mode, because every control
   * on it is answered by `seo.gsc_location_keywords` — sorting the 25 rows the
   * browser happens to hold is not sorting a location's keywords (P28).
   */
  const [view, setView] = useState<LocationKeywordsView>({
    page: 1,
    pageSize: PAGE_SIZE,
    search: "",
    sort: "clicks",
    sortDir: "desc",
    decidedBy: [],
    clicksMin: null,
    clicksMax: null,
    impressionsMin: null,
    impressionsMax: null,
  });
  const openWhy = useOpenGscWhyScoreWindow();

  const keywords = useQuery({
    queryKey: locationKeywordsQueryKey(siteId, locationId, bucket, start, end, view),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      getLocationKeywords(siteId, locationId, bucket, start, end, view, signal),
  });

  if (keywords.isError) {
    return (
      <div className="px-2.5 py-2">
        <InlineQueryError
          what={`the keywords behind ${locationName}`}
          error={keywords.error}
          onRetry={() => void keywords.refetch()}
        />
      </div>
    );
  }

  const rows = keywords.data?.rows ?? [];
  const total = keywords.data?.total ?? 0;
  /** Did the reader narrow this list? Decides which empty state is honest. */
  const narrowed =
    view.search.trim() !== "" ||
    view.decidedBy.length > 0 ||
    view.clicksMin !== null ||
    view.clicksMax !== null ||
    view.impressionsMin !== null ||
    view.impressionsMax !== null;

  const columns: MatrxColumnDef<LocationKeywordRow>[] = [
    {
      id: "keyword",
      accessorKey: "keyword",
      header: "Keyword",
      filter: "text",
      cell: (row) => (
        <button
          type="button"
          onClick={() =>
            openWhy({
              siteId,
              brandId,
              keywordId: row.keyword_id,
              keyword: row.keyword,
            })
          }
          title="Why this keyword is worth what it is — opens beside this view"
          className="min-w-0 truncate text-left text-[11px] text-foreground hover:text-primary hover:underline"
        >
          {row.keyword}
        </button>
      ),
    },
    {
      id: "decided_by",
      accessorKey: "decided_by",
      header: "Attributed by",
      filter: "select",
      width: 150,
      /* The reader's words, and the same set the RPC filters on. */
      filterOptions: DECIDED_BY_FILTER_OPTIONS,
      cell: (row) =>
        row.decided_by ? (
          <span
            className="rounded border border-border bg-muted/40 px-1 py-px text-[9px] text-muted-foreground"
            title={explainDecidedBy(row.decided_by, row.place_name, null)}
          >
            {decidedByChip(row.decided_by)}
          </span>
        ) : (
          <span className="text-[9px] text-muted-foreground">—</span>
        ),
    },
    {
      id: "clicks",
      accessorKey: "clicks",
      header: "Clicks",
      filter: "number",
      align: "right",
      width: 90,
      cell: (row) => (
        <span className="text-[11px] font-medium tabular-nums text-foreground">
          {formatCount(Number(row.clicks))}
        </span>
      ),
    },
    {
      id: "impressions",
      accessorKey: "impressions",
      header: "Impressions",
      filter: "number",
      align: "right",
      width: 110,
      cell: (row) => (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatCount(Number(row.impressions))}
        </span>
      ),
    },
  ];

  return (
    <MatrxDataTable<LocationKeywordRow>
      data={rows}
      columns={columns}
      getRowId={(row) => row.keyword_id}
      isLoading={keywords.isPending}
      isFetching={keywords.isFetching}
      className="border-0"
      query={{
        mode: "controlled",
        totalItems: total,
        state: {
          page: view.page,
          pageSize: view.pageSize,
          search: view.search,
          anyOf: "",
          columnFilters: toColumnFilters(view),
          sort: { id: view.sort, direction: view.sortDir },
        },
        onStateChange: (next) => setView((current) => nextView(current, next)),
      }}
      copy={{
        label: "Keyword",
        listLabel: `Keywords behind ${locationName}`,
        location: "Traffic by location",
        rowKind: "gsc_location_keyword",
        listKind: "gsc_location_keyword_list",
        humanRow: (row) =>
          `${row.keyword} — ${formatCount(Number(row.clicks))} clicks, ${formatCount(Number(row.impressions))} impressions${row.decided_by ? ` (${decidedByChip(row.decided_by)})` : ""}`,
      }}
      emptyState={{
        /**
         * Empty because the LIST is empty, or empty because the reader narrowed
         * it? Only the first is news about this location. Telling someone whose
         * filter matched nothing that "search demand has stopped" would be a
         * false report about their business.
         */
        title: narrowed
          ? "Nothing matches these filters"
          : `No keyword in ${windowLabel} lands here`,
        // A row can be listed on compare traffic alone — its location earned
        // searches last month and none this month. "No keyword lands here"
        // would read as a bug; the real news is that the traffic STOPPED.
        description: narrowed
          ? "Clear a filter, or search for a different phrase."
          : comparedKeywords > 0
            ? `In the 28 days before that, ${formatCount(comparedKeywords)} did — this location's search demand has stopped, which is why the row is still here.`
            : "No search in this window lands on this row.",
      }}
    />
  );
}

// ── The decomposition ──────────────────────────────────────────────────────

export function LocationDecomposition({
  siteId,
  brandId,
  window,
  windowLabel,
}: {
  siteId: string;
  brandId: string;
  window: {
    start: string;
    end: string;
    compareStart: string | null;
    compareEnd: string | null;
  };
  windowLabel: string;
}) {
  const [openRow, setOpenRow] = useState<string | null>(null);

  const summary = useQuery({
    queryKey: locationSummaryQueryKey(siteId, window.start, window.end),
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      getLocationSummary(
        siteId,
        window.start,
        window.end,
        window.compareStart,
        window.compareEnd,
        signal,
      ),
  });

  if (summary.isPending) {
    return (
      <div className="space-y-1">
        <Skeleton className="h-11 rounded-md" />
        <Skeleton className="h-11 rounded-md" />
      </div>
    );
  }
  if (summary.isError) {
    return (
      <InlineQueryError
        what="traffic by location"
        error={summary.error}
        onRetry={() => void summary.refetch()}
      />
    );
  }

  const rows = summary.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-[11px] text-muted-foreground">
        No Search Console traffic in {windowLabel}, so there is nothing to split
        by location yet.
      </p>
    );
  }

  const totalClicks = rows.reduce((sum, row) => sum + Number(row.clicks), 0);

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
      {rows.map((row) => {
        const key = row.location_id ?? row.decided_by;
        const open = openRow === key;
        const clicks = Number(row.clicks);
        const share = totalClicks > 0 ? (clicks / totalClicks) * 100 : 0;
        return (
          <li key={key}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenRow(open ? null : key)}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors",
                open ? "bg-accent/70" : "hover:bg-accent",
              )}
            >
              <span className="shrink-0 text-muted-foreground">
                {open ? (
                  <ChevronDown className="h-3 w-3" aria-hidden />
                ) : (
                  <ChevronRight className="h-3 w-3" aria-hidden />
                )}
              </span>
              <span className="shrink-0">
                <RowIcon row={row} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">
                  {row.location_name}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {rowSubtitle(row)}
                </span>
              </span>
              <span className="hidden shrink-0 items-baseline gap-1 sm:flex">
                <span className="w-9 text-right text-[10px] tabular-nums text-muted-foreground">
                  {share >= 0.5 ? `${Math.round(share)}%` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs font-semibold tabular-nums text-foreground">
                  {formatCount(clicks)}
                </span>
                <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">
                  clicks
                </span>
              </span>
              <span className="w-12 shrink-0 text-right">
                <Delta now={clicks} before={Number(row.cmp_clicks)} />
              </span>
              <span className="hidden w-16 shrink-0 text-right md:block">
                <span className="block text-[11px] tabular-nums text-muted-foreground">
                  {formatCount(Number(row.impressions))}
                </span>
                <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">
                  impressions
                </span>
              </span>
              <span className="hidden w-14 shrink-0 text-right lg:block">
                <span className="block text-[11px] tabular-nums text-muted-foreground">
                  {formatCount(Number(row.queries))}
                </span>
                <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">
                  keywords
                </span>
              </span>
            </button>
            {open ? (
              <div className="border-t border-border bg-muted/20">
                <LocationKeywords
                  siteId={siteId}
                  brandId={brandId}
                  locationId={row.location_id}
                  bucket={
                    row.location_id
                      ? null
                      : row.decided_by === "unresolved"
                        ? "unresolved"
                        : "not_local"
                  }
                  locationName={row.location_name}
                  start={window.start}
                  end={window.end}
                  windowLabel={windowLabel}
                  comparedKeywords={Number(row.cmp_queries)}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
