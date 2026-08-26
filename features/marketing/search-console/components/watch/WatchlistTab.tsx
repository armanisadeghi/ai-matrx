"use client";

/**
 * Watchlist — ONE mixed table of every watched query and page for the
 * active site (kind chip per row, All / Queries / Pages toggle). Rows come
 * from `seo.gsc_perf_watch`, anchored on the watched id sets so an item
 * with no impressions in the period still shows as a real zero row (that
 * "still nothing" signal is the point of watching it). Unwatch inline;
 * row click drills GSC-style; right-click opens floating panels.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Eye, PanelTop } from "lucide-react";
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import { useOpenGscDrilldownWindow } from "@/features/overlays/openers/gscDrilldownWindow";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import {
  buildGscMetricColumns,
  buildGscValueColumns,
  gscMetricCopyLines,
} from "@/features/marketing/search-console/lib/columns";
import { gscScopeAttributes } from "@/features/marketing/search-console/lib/copy-payloads";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { getGscKeywordValueFor } from "@/features/marketing/search-console/data-insights";
import { getGscWatch } from "@/features/marketing/search-console/data-watch";
import {
  useToggleWatch,
  useWatchedIds,
} from "@/features/marketing/search-console/hooks/useWatchState";
import { WatchButton } from "@/features/marketing/search-console/components/watch/WatchButton";
import {
  keywordEntityRef,
  useKeywordAssignSurfaces,
  useKeywordMenuSection,
  type KeywordMenuRow,
} from "@/features/marketing/seo/keyword/keyword-actions";
import type {
  GscCompareMode,
  GscRangeKey,
  GscResolvedPeriods,
  GscWatchRow,
} from "@/features/marketing/search-console/types";

export function WatchlistTab({
  siteId,
  siteName,
  periods,
  panelRange,
  onDrill,
}: {
  siteId: string;
  siteName: string | null;
  periods: GscResolvedPeriods;
  panelRange: {
    range: GscRangeKey;
    customFrom: string | null;
    customTo: string | null;
    compare: GscCompareMode;
  };
  onDrill: (row: GscWatchRow) => void;
}) {
  const hasCompare = periods.compare !== null;
  const [kindFilter, setKindFilter] = useState<"all" | "query" | "page">("all");
  const watched = useWatchedIds();
  const toggle = useToggleWatch();
  const openDrilldown = useOpenGscDrilldownWindow();

  const pageIds = watched.data?.pageIds ?? [];
  const keywordIds = watched.data?.keywordIds ?? [];

  const rowsQuery = useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "watch-rows",
      siteId,
      periods.current.start,
      periods.current.end,
      periods.compare?.start ?? "",
      periods.compare?.end ?? "",
      [...pageIds].sort().join(","),
      [...keywordIds].sort().join(","),
    ],
    queryFn: ({ signal }) =>
      getGscWatch(siteId, periods, pageIds, keywordIds, signal),
    enabled: !!watched.data,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const allRows = rowsQuery.data ?? [];
  const rows =
    kindFilter === "all"
      ? allRows
      : allRows.filter((r) => r.kind === kindFilter);

  // KI-026 — Class · Score · Level for the watched QUERIES (a watched page's
  // `entity_id` is a page id, not a keyword id — the value resolver only
  // applies to the query rows), through the ONE stamp resolver.
  const sortedKeywordIds = [...keywordIds].sort();
  const keywordValues = useQuery({
    queryKey: ["marketing", "gsc", "keyword-value-for", siteId, sortedKeywordIds],
    queryFn: ({ signal }) =>
      getGscKeywordValueFor(siteId, sortedKeywordIds, signal),
    enabled: sortedKeywordIds.length > 0,
    staleTime: 60_000,
  });
  const valueFor = (row: GscWatchRow) =>
    row.kind === "query" ? keywordValues.data?.get(row.entity_id) : undefined;

  // State, not a ref: `extraSections` below reads it directly, and the
  // keyword section must appear/disappear per the actual row kind clicked
  // (this table mixes watched queries and pages in one pane).
  const [clickedRow, setClickedRow] = useState<GscWatchRow | null>(null);
  const rowId = (row: GscWatchRow) => `${row.kind}:${row.entity_id}`;
  const resolveRowContext = (target: HTMLElement | null) => {
    const id = target?.closest("[data-row-id]")?.getAttribute("data-row-id");
    const row = id ? (rows.find((r) => rowId(r) === id) ?? null) : null;
    setClickedRow(row);
    if (!row) return null;
    // KI-026's own row: Attach To / Share target the watched keyword or page,
    // never the pane.
    const entity =
      row.kind === "query"
        ? keywordEntityRef({ phrase: row.key, keywordId: row.entity_id })
        : { type: "web_page" as const, id: row.entity_id, title: row.key };
    return {
      content: humanLines(
        gscMetricCopyLines(
          row.kind === "query" ? "Query" : "Page",
          row.kind === "query" ? "query" : "page",
          row,
        ),
      ),
      [CONTEXT_MENU_ENTITY_KEY]: entity,
    };
  };

  const queryClient = useQueryClient();
  // MSR-01 — the shared keyword row-actions family, same as every other
  // keyword surface. Only the watched QUERY rows are keywords; a watched
  // page has no single-keyword identity behind it.
  const keywordSurfaces = useKeywordAssignSurfaces({
    siteId,
    onChanged: () =>
      void queryClient.invalidateQueries({
        queryKey: ["marketing", "gsc", "keyword-value-for", siteId],
      }),
  });
  const keywordMenuSection = useKeywordMenuSection({
    siteId,
    siteName,
    surfaces: keywordSurfaces,
    getRow: (): KeywordMenuRow | null => {
      const row = clickedRow;
      if (!row || row.kind !== "query") return null;
      return {
        phrase: row.key,
        keywordId: row.entity_id,
        currentLevel: valueFor(row)?.value_band ?? null,
        levelIsRuling: valueFor(row)?.value_source === "override",
      };
    },
  });

  const openRowDrillPanel = () => {
    const row = clickedRow;
    if (!row) {
      toast.error("Right-click a data row to drill into it.");
      return;
    }
    openDrilldown({
      siteId,
      siteName,
      dimension: row.kind === "query" ? "page" : "query",
      filters:
        row.kind === "query"
          ? { query_eq: row.key }
          : { page_eq: row.entity_id },
      range: panelRange.range,
      customFrom: panelRange.customFrom,
      customTo: panelRange.customTo,
      compare: panelRange.compare,
      title:
        row.kind === "query"
          ? `Pages for “${row.key}”`
          : `Queries for ${row.key}`,
    });
  };

  const columns: MatrxColumnDef<GscWatchRow>[] = [
    {
      id: "unwatch",
      header: "",
      sortable: false,
      filter: false,
      width: 36,
      cell: (row) => (
        <WatchButton
          watched
          pending={
            toggle.isPending &&
            toggle.variables?.target.entityId === row.entity_id
          }
          noun={row.kind === "query" ? "query" : "page"}
          onToggle={() =>
            toggle.mutate({
              target: {
                kind: row.kind === "query" ? "query" : "page",
                entityId: row.entity_id,
                rowKey: row.key,
              },
              watched: false,
            })
          }
        />
      ),
    },
    {
      id: "kind",
      accessorKey: "kind",
      header: "Type",
      width: 70,
      // The All/Queries/Pages toggle above owns kind filtering — a second,
      // independent column filter could contradict it.
      filter: false,
      cell: (row) => (
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            row.kind === "query"
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {row.kind}
        </span>
      ),
    },
    {
      id: "key",
      accessorKey: "key",
      header: "Watched item",
      filter: false,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "block max-w-[24rem] truncate text-xs font-medium sm:max-w-[32rem]",
              row.impressions === 0
                ? "text-muted-foreground"
                : "text-foreground",
            )}
            title={row.key}
          >
            {row.key}
          </span>
          {/*
            THE DOOR LAW: a watched PAGE is a canonical page record — its
            `entity_id` is the page id the watch was registered against — so it
            must be reachable. A watched QUERY is a keyword with no route yet,
            and gets no door rather than a broken one. The door is a trailing
            anchor because the row click is the drilldown (queries for this
            page), which stays the row's own gesture.
          */}
          {row.kind === "page" && row.entity_id ? (
            <Link
              href={marketingRoutes.sitePage(null, siteId, row.entity_id)}
              onClick={(event) => event.stopPropagation()}
              title={`Open ${row.key} in the page workspace`}
              aria-label={`Open ${row.key} in the page workspace`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          ) : null}
          {row.impressions === 0 ? (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              no impressions in period
            </span>
          ) : null}
        </span>
      ),
    },
    // KI-026 — the shared Class · Score · Level cells, resolved through
    // `gsc_keyword_value_for` for the watched queries on screen. Blank on
    // watched pages (there is no per-page value stamp).
    ...buildGscValueColumns<GscWatchRow>(valueFor, {
      siteId,
      keywordOf: (row) => (row.kind === "query" ? row.key : null),
    }),
    ...buildGscMetricColumns<GscWatchRow>(hasCompare, "all"),
  ];

  const error = watched.isError
    ? watched.error
    : rowsQuery.isError
      ? rowsQuery.error
      : null;

  if (error) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <p className="max-w-lg text-center text-xs text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  const empty = !watched.isLoading && pageIds.length + keywordIds.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-0.5 self-start rounded-md border border-border bg-card p-0.5">
        {(["all", "query", "page"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className={cn(
              "rounded px-2 py-0.5 text-[11px] transition-colors",
              kindFilter === kind
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            onClick={() => setKindFilter(kind)}
          >
            {kind === "all" ? "All" : kind === "query" ? "Queries" : "Pages"}
          </button>
        ))}
      </div>
      {pageIds.length > 200 || keywordIds.length > 200 ? (
        <p className="text-[11px] text-warning">
          Showing metrics for the first 200 watched pages and 200 watched
          queries — unwatch items you no longer need to see the rest.
        </p>
      ) : null}
      <div className="min-h-0 flex-1">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/60 p-8 text-center">
            <Eye className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Nothing watched yet
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              Use the eye button (or right-click → Watch) on any query or page
              row — watched items appear here with their live numbers, even when
              they have zero impressions in the period.
            </p>
          </div>
        ) : (
          <NonEditableContextMenu
            sourceFeature="marketing"
            contentSource={{ type: "raw" }}
            contextData={{ content: "" }}
            resolveContextOnOpen={resolveRowContext}
            extraSections={[
              {
                id: "gsc-watch-drill",
                label: "Search Console",
                anchor: "after-compare",
                items: [
                  {
                    kind: "item",
                    id: "gsc-watch-drill-panel",
                    label: "Drill into this row — floating panel",
                    icon: PanelTop,
                    onSelect: openRowDrillPanel,
                  },
                ],
              },
              // MSR-01 — the shared keyword row-actions family (Set class /
              // Set service / Set level / Open Keyword Intelligence), the
              // same menu every other keyword surface offers. Watched PAGE
              // rows are not keywords, so the section is absent for them.
              ...(clickedRow?.kind === "query" ? [keywordMenuSection] : []),
            ]}
          >
            <div className="flex h-full min-h-0 flex-col">
              {keywordSurfaces.isOpen ? (
                <div className="mb-2 shrink-0">{keywordSurfaces.node}</div>
              ) : null}
              <MatrxDataTable<GscWatchRow>
                urlState={{ id: "gsc-watchlist" }}
                data={rows}
                columns={columns}
                getRowId={rowId}
                isLoading={watched.isLoading || rowsQuery.isLoading}
                isFetching={rowsQuery.isFetching}
                toolbar={{ searchPlaceholder: "Search watchlist…" }}
                copy={{
                  label: "Watched item",
                  listLabel: "Search Console watchlist",
                  location: webLocation("Search Console — Watchlist"),
                  rowKind: "web-gsc-watch-item",
                  listKind: "web-gsc-watchlist",
                  rowDescription:
                    "One watched query or page with its search performance for the selected site and period.",
                  listDescription:
                    "Every watched query/page for this site, including zero-impression rows.",
                  humanRow: (row) =>
                    humanLines(
                      gscMetricCopyLines(
                        row.kind === "query" ? "Query" : "Page",
                        row.kind === "query" ? "query" : "page",
                        row,
                      ),
                    ),
                  rowAttributes: (row) => ({
                    ...gscScopeAttributes(siteId, siteName, periods, {}),
                    kind: row.kind,
                    entity_id: row.entity_id,
                    key: row.key,
                  }),
                  listAttributes: (visible) => ({
                    ...gscScopeAttributes(siteId, siteName, periods, {}),
                    visible_rows: visible.length,
                    watched_pages: pageIds.length,
                    watched_queries: keywordIds.length,
                  }),
                }}
                detail={{ enabled: false }}
                window={{ enabled: false }}
                onRowOpen={onDrill}
                pageSize={50}
                emptyState={{
                  icon: <Eye className="h-8 w-8 text-muted-foreground" />,
                  title: "No watched items of this type",
                  description:
                    "Switch the filter above, or watch more queries and pages from any table.",
                }}
                className="flex-1"
              />
            </div>
          </NonEditableContextMenu>
        )}
      </div>
    </div>
  );
}
