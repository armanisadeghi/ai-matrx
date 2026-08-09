"use client";

/**
 * PageSearchConsoleCard — the Google Search Console pane of the page
 * workspace. Range-selectable (28d / 90d / 12m / all) page totals on one
 * tight line, with the per-query breakdown table as the centerpiece:
 * every stored query reaching this canonical page, strongest first, the
 * page's target keyword pinned + highlighted when it appears.
 *
 * Data comes from two stored sources:
 * - Page totals → `web.gsc_page_stat` (what the scraper GSC sync writes;
 *   same table as the KPI strip and v_page_list).
 * - Per-query breakdown → `seo.search_performance_daily` query_page rows
 *   when that pipeline has run for the site; otherwise the query table is
 *   honestly empty.
 */

import { useState } from "react";
import { Crosshair, SearchCheck, Unplug } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import {
  formatDate,
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  usePageQueryStats,
  usePageSearchTotals,
} from "@/features/marketing/seo/keyword/hooks";
import {
  GSC_RANGES,
  gscRangeDays,
  normalizeKeywordPhrase,
  type GscRangeKey,
} from "@/features/marketing/seo/keyword/data";
import type { PageQueryStat } from "@/features/marketing/seo/keyword/types";
import type { MarketingPage } from "@/features/marketing/types";
import {
  MOBILE_TABLE_FROZEN,
} from "@/components/official/mobile-table/mobileTable";

const QUERY_LIMIT = 50;

function formatCtr(ctr: number | null): string {
  return ctr === null ? "—" : `${(ctr * 100).toFixed(2)}%`;
}

function queryCtr(row: PageQueryStat): number | null {
  return row.impressions > 0 ? row.clicks / row.impressions : null;
}

/** Target-keyword row pinned first, everything else stays clicks-desc. */
function orderWithTarget(
  rows: PageQueryStat[],
  target: string,
): PageQueryStat[] {
  if (!target) return rows;
  const index = rows.findIndex(
    (row) => normalizeKeywordPhrase(row.query) === target,
  );
  if (index <= 0) return rows;
  return [rows[index], ...rows.slice(0, index), ...rows.slice(index + 1)];
}

export function PageSearchConsoleCard({ page }: { page: MarketingPage }) {
  const { site } = useMarketingSite();
  const [range, setRange] = useState<GscRangeKey>("28d");
  const days = gscRangeDays(range);
  const totals = usePageSearchTotals(page.id, days);
  const queries = usePageQueryStats(page.id, days, QUERY_LIMIT);

  const rangeLabel =
    GSC_RANGES.find((entry) => entry.key === range)?.label ?? range;
  const targetNormalized = normalizeKeywordPhrase(page.target_keyword ?? "");
  const rows = orderWithTarget(queries.data?.stats ?? [], targetNormalized);
  const truncated = Boolean(totals.data?.truncated || queries.data?.truncated);
  const isLoading = totals.isLoading || queries.isLoading;
  const isError = totals.isError || queries.isError;
  const hasAnyData = Boolean(
    (totals.data && totals.data.impressions > 0) || rows.length > 0,
  );
  const neverSynced = !site.gsc_synced_at;

  const copy = webCopy({
    kind: "web-page-search-console",
    label: "Google Search Console",
    description:
      "Stored Google Search Console performance for this canonical page over the selected range: page totals plus the per-query breakdown.",
    surface: `Google Search Console — ${page.url}`,
    data: {
      url: page.url,
      range: rangeLabel,
      totals: totals.data ?? null,
      queries: rows,
      truncated,
      site_synced_at: site.gsc_synced_at,
    },
    lines: [
      ["URL", page.url],
      ["Range", rangeLabel],
      ["Clicks", totals.data?.clicks],
      ["Impressions", totals.data?.impressions],
      ["CTR", formatCtr(totals.data?.ctr ?? null)],
      ["Average position", totals.data?.position?.toFixed(1)],
      ["Queries", rows.length],
      ...rows.map((row): [string, string] => [
        row.query,
        `${row.clicks} clicks · ${row.impressions} impressions · CTR ${formatCtr(
          queryCtr(row),
        )}${row.position === null ? "" : ` · pos ${row.position.toFixed(1)}`}`,
      ]),
      ["Site last synced", site.gsc_synced_at],
    ],
    attributes: { page_id: page.id, range: rangeLabel },
  });

  const rangeControl = (
    <div
      role="group"
      aria-label="Search Console date range"
      className="flex items-center rounded-md border border-border p-0.5"
    >
      {GSC_RANGES.map((entry) => (
        <button
          key={entry.key}
          type="button"
          aria-pressed={range === entry.key}
          onClick={() => setRange(entry.key)}
          className={cn(
            "h-5 rounded px-1.5 text-[11px] leading-none transition-colors",
            range === entry.key
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="grid gap-2 p-3">
        <div className="h-6 animate-pulse rounded-md bg-muted/40" />
        <div className="h-32 animate-pulse rounded-md bg-muted/40" />
      </div>
    );
  } else if (isError) {
    body = (
      <QueryError
        error={totals.error ?? queries.error}
        onRetry={() => {
          void totals.refetch();
          void queries.refetch();
        }}
      />
    );
  } else if (neverSynced && !hasAnyData) {
    body = (
      <p className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
        <Unplug className="h-4 w-4 shrink-0" />
        Google Search Console has never been synced for this site — connect and
        run a sync from site integrations to see real search performance here.
      </p>
    );
  } else {
    body = (
      <div className="flex flex-col">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-3 py-2">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[11px] text-muted-foreground">Clicks</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {totals.data?.clicks.toLocaleString() ?? "—"}
            </span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[11px] text-muted-foreground">Impr</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {totals.data?.impressions.toLocaleString() ?? "—"}
            </span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[11px] text-muted-foreground">CTR</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatCtr(totals.data?.ctr ?? null)}
            </span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[11px] text-muted-foreground">Avg pos</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {totals.data?.position?.toFixed(1) ?? "—"}
            </span>
          </span>
          <Badge
            variant={hasAnyData ? "success" : "outline"}
            className="ml-auto"
          >
            {hasAnyData ? "Reporting" : "No page data"}
          </Badge>
        </div>
        {rows.length === 0 ? (
          <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
            <SearchCheck className="h-4 w-4 shrink-0" />
            No query-level Search Console rows stored for this page in the
            selected range.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className={cn("border-collapse text-xs", MOBILE_TABLE_FROZEN)}>
              <thead>
                <tr className="sticky top-0 z-10 bg-card text-left text-[11px] text-muted-foreground">
                  <th className="border-b border-border px-3 py-1.5 font-medium">
                    Query
                  </th>
                  <th className="border-b border-border px-2 py-1.5 text-right font-medium">
                    Clicks
                  </th>
                  <th className="border-b border-border px-2 py-1.5 text-right font-medium">
                    Impr
                  </th>
                  <th className="border-b border-border px-2 py-1.5 text-right font-medium">
                    CTR
                  </th>
                  <th className="border-b border-border px-3 py-1.5 text-right font-medium">
                    Pos
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const isTarget =
                    targetNormalized !== "" &&
                    normalizeKeywordPhrase(row.query) === targetNormalized;
                  return (
                    <tr
                      key={row.query}
                      className={cn(
                        "hover:bg-accent/50",
                        isTarget && "bg-primary/5",
                      )}
                    >
                      <td
                        className={cn(
                          "px-3 py-1 text-foreground sm:max-w-0 sm:truncate",
                          isTarget && "font-medium text-primary",
                        )}
                        title={row.query}
                      >
                        {isTarget ? (
                          <Crosshair className="mr-1 inline h-3 w-3 align-[-1px]" />
                        ) : null}
                        {row.query}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-foreground">
                        {row.clicks.toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                        {row.impressions.toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                        {formatCtr(queryCtr(row))}
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums text-muted-foreground">
                        {row.position === null ? "—" : row.position.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          Site sync last completed {formatDate(site.gsc_synced_at)}. Sync runs
          site-wide from site integrations — there is no page-only refresh.
          {truncated
            ? " Numbers are a floor: the bounded read capped out before the full range."
            : null}
        </p>
      </div>
    );
  }

  return (
    <SectionCard
      title="Google Search Console"
      collapsible
      anchor="gsc_metrics_28d"
      headerExtra={rangeControl}
      copy={copy}
    >
      {body}
    </SectionCard>
  );
}
