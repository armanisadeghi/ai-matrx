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
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import { useOpenGscWhyScoreWindow } from "@/features/overlays/openers/gscWhyScoreWindow";
import {
  getLocationKeywords,
  getLocationSummary,
  locationKeywordsQueryKey,
  locationSummaryQueryKey,
} from "./data";
import {
  decidedByChip,
  explainDecidedBy,
  type LocationBucket,
  type LocationSummaryRow,
} from "./types";

const PAGE_SIZE = 25;

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
}: {
  siteId: string;
  brandId: string;
  locationId: string | null;
  bucket: LocationBucket | null;
  locationName: string;
  start: string;
  end: string;
}) {
  const [page, setPage] = useState(1);
  const openWhy = useOpenGscWhyScoreWindow();

  const keywords = useQuery({
    queryKey: locationKeywordsQueryKey(siteId, locationId, bucket, start, end, page),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      getLocationKeywords(
        siteId,
        locationId,
        bucket,
        start,
        end,
        page,
        PAGE_SIZE,
        signal,
      ),
  });

  if (keywords.isPending) {
    return (
      <div className="space-y-1 px-2.5 py-2">
        <Skeleton className="h-5 rounded" />
        <Skeleton className="h-5 rounded" />
        <Skeleton className="h-5 rounded" />
      </div>
    );
  }
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

  const { rows, total } = keywords.data;
  if (total === 0) {
    return (
      <p className="px-2.5 py-2.5 text-[11px] text-muted-foreground">
        No keyword in this window lands here.
      </p>
    );
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li
            key={row.keyword_id}
            className="flex items-center gap-2 px-2.5 py-1 transition-colors hover:bg-accent/60"
          >
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
              className="min-w-0 flex-1 truncate text-left text-[11px] text-foreground hover:text-primary hover:underline"
            >
              {row.keyword}
            </button>
            {row.decided_by ? (
              <span
                className="shrink-0 rounded border border-border bg-muted/40 px-1 py-px text-[9px] text-muted-foreground"
                title={explainDecidedBy(row.decided_by, row.place_name, null)}
              >
                {decidedByChip(row.decided_by)}
              </span>
            ) : null}
            <span className="w-12 shrink-0 text-right text-[11px] font-medium tabular-nums text-foreground">
              {formatCount(Number(row.clicks))}
            </span>
            <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {formatCount(Number(row.impressions))}
            </span>
          </li>
        ))}
      </ul>
      {lastPage > 1 ? (
        <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-1.5">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of{" "}
            {formatCount(total)}
          </span>
          <span className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page === 1 || keywords.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-6 px-2 text-[10px]"
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= lastPage || keywords.isFetching}
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              className="h-6 px-2 text-[10px]"
            >
              Next
            </Button>
          </span>
        </div>
      ) : null}
    </div>
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
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
