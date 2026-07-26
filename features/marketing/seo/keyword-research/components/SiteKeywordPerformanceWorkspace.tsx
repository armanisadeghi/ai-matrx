"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { parseBingSiteBinding } from "@/features/marketing/bing/binding";
import { syncBingSearchPerformance } from "@/features/marketing/bing/service";
import { extractErrorMessage } from "@/utils/errors";
import { KeywordCompetitionBadge } from "./KeywordMetrics";

import type { SiteKeywordPerformanceRow } from "../types";
import { useSiteKeywordPerformance } from "../useSiteKeywordPerformance";

const PROVIDER_LABELS: Record<string, string> = {
  gsc: "Google Search Console",
  bing_webmaster: "Bing Webmaster",
};

function providerLabel(provider: string | null): string {
  if (!provider) return "Unknown source";
  return PROVIDER_LABELS[provider] ?? provider;
}

function integer(value: number | null): string {
  return value === null ? "—" : Intl.NumberFormat().format(Math.round(value));
}

function decimal(value: number | null, digits = 1): string {
  return value === null ? "—" : value.toFixed(digits);
}

function money(value: number | null): string {
  return value === null
    ? "—"
    : Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(value);
}

export function SiteKeywordPerformanceWorkspace() {
  const { site, sitePath } = useMarketingSite();
  const table = useMarketingTableState({
    defaultSort: { id: "clicks", direction: "desc" },
    defaultPageSize: 50,
  });
  const performance = useSiteKeywordPerformance(site.id, table.queryState);
  const bingBinding = parseBingSiteBinding(site.integrations);
  const [syncingBing, setSyncingBing] = useState(false);

  const runBingSync = async () => {
    setSyncingBing(true);
    try {
      await syncBingSearchPerformance(site.id);
      await performance.refetch();
      toast.success("Bing search performance synced", {
        description: `Fresh Bing query evidence is stored for ${site.domain}.`,
      });
    } catch (error) {
      toast.error("Bing search performance sync failed", {
        description: extractErrorMessage(error),
      });
    } finally {
      setSyncingBing(false);
    }
  };

  const columns: MatrxColumnDef<SiteKeywordPerformanceRow>[] = [
    {
      id: "provider",
      accessorKey: "provider",
      header: "Source",
      filter: "select",
      filterOptions: [
        { value: "gsc", label: "Google Search Console" },
        { value: "bing_webmaster", label: "Bing Webmaster" },
      ],
      cell: (row) => (
        <Badge variant="outline" className="whitespace-nowrap">
          {providerLabel(row.provider)}
        </Badge>
      ),
    },
    {
      id: "query",
      accessorKey: "query",
      header: "Search query",
      filter: "text",
      cell: (row) => (
        <div className="min-w-48">
          <p className="font-medium text-foreground">{row.query ?? "—"}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {row.first_date && row.last_date
              ? `${row.first_date} → ${row.last_date}`
              : "No stored window"}
          </p>
        </div>
      ),
    },
    {
      id: "clicks",
      accessorKey: "clicks",
      header: "Clicks",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums">{integer(row.clicks)}</span>
      ),
    },
    {
      id: "impressions",
      accessorKey: "impressions",
      header: "Impressions",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums">{integer(row.impressions)}</span>
      ),
    },
    {
      id: "ctr",
      accessorKey: "ctr",
      header: "CTR",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums">
          {row.ctr === null ? "—" : `${decimal(row.ctr * 100)}%`}
        </span>
      ),
    },
    {
      id: "average_position",
      accessorKey: "average_position",
      header: "Position",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums">{decimal(row.average_position)}</span>
      ),
    },
    {
      id: "search_volume",
      accessorKey: "search_volume",
      header: "Volume",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums">{integer(row.search_volume)}</span>
      ),
    },
    {
      id: "cpc",
      accessorKey: "cpc",
      header: "CPC",
      filter: "number",
      align: "right",
      cell: (row) => <span className="tabular-nums">{money(row.cpc)}</span>,
    },
    {
      id: "competition",
      accessorKey: "competition",
      header: "Competition",
      filter: "select",
      filterOptions: [
        { value: "LOW", label: "Low" },
        { value: "MEDIUM", label: "Medium" },
        { value: "HIGH", label: "High" },
      ],
      cell: (row) => (
        // Canonical badge — the ONE competition visual (KeywordMetrics),
        // shared with the workbench, window panel, and seo tool renderer.
        <KeywordCompetitionBadge competition={row.competition} />
      ),
    },
    {
      id: "top_page_path",
      accessorKey: "top_page_path",
      header: "Strongest page",
      filter: "text",
      cell: (row) =>
        row.top_page_id ? (
          <Link
            href={`${sitePath}/pages/${row.top_page_id}`}
            className="inline-flex max-w-64 items-center gap-1 text-primary hover:underline"
          >
            <span className="truncate">
              {row.top_page_path ?? row.top_page_url ?? "Open page"}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </Link>
        ) : (
          <span className="text-muted-foreground">
            {row.top_page_path ?? "Unmatched"}
          </span>
        ),
    },
    {
      id: "workflow_status",
      accessorKey: "workflow_status",
      header: "Workflow",
      filter: "select",
      filterOptions: [
        { value: "candidate", label: "Candidate" },
        { value: "targeted", label: "Targeted" },
        { value: "in_progress", label: "In progress" },
        { value: "ranking", label: "Ranking" },
        { value: "ignored", label: "Ignored" },
        { value: "suppressed", label: "Suppressed" },
      ],
      cell: (row) =>
        row.workflow_status ? (
          <Badge variant="outline">
            {row.workflow_status.replaceAll("_", " ")}
          </Badge>
        ) : (
          <span className="text-muted-foreground">Not classified</span>
        ),
    },
  ];

  if (performance.isError) {
    return (
      <QueryError
        error={performance.error}
        onRetry={() => void performance.refetch()}
      />
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-textured p-3 sm:p-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" />
            Organic keyword performance
          </h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Persisted 28-day query evidence for {site.domain} across every
            connected source (Google Search Console, Bing Webmaster),
            enriched with stored DataForSEO market data when available.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {bingBinding?.enabled ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              disabled={syncingBing}
              onClick={() => void runBingSync()}
            >
              {syncingBing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {syncingBing ? "Syncing Bing…" : "Sync Bing now"}
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline" className="h-8">
              <Link href={marketingRoutes.connectionsBing()}>Connect Bing Webmaster</Link>
            </Button>
          )}
          <div className="rounded-md border border-border bg-muted/30 px-3 py-1.5 text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Matching queries
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {Intl.NumberFormat().format(performance.data?.total ?? 0)}
            </p>
          </div>
        </div>
      </section>

      <section className="min-h-[36rem] rounded-lg border border-border bg-card p-2">
        <MatrxDataTable<SiteKeywordPerformanceRow>
          data={performance.data?.rows ?? []}
          columns={columns}
          getRowId={(row) =>
            `${row.provider ?? "gsc"}:${row.keyword_id ?? "unmapped"}:${row.query ?? "unknown"}`
          }
          isLoading={performance.isLoading}
          isFetching={performance.isFetching}
          query={{
            mode: "controlled",
            state: table.state,
            totalItems: performance.data?.total ?? 0,
            onStateChange: table.onStateChange,
          }}
          toolbar={{ searchPlaceholder: "Search query or ranking page…" }}
          emptyState={{
            icon: <Search className="h-8 w-8 text-muted-foreground" />,
            title: "No search queries stored yet",
            description:
              "Connect Google Search Console or Bing Webmaster and run a search-performance sync to populate this site.",
          }}
          detail={{
            title: (row) => row.query ?? "Search query",
            description: (row) =>
              `${integer(row.clicks)} clicks · ${integer(row.impressions)} impressions`,
          }}
        />
      </section>
    </main>
  );
}
