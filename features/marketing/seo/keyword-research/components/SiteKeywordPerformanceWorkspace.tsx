"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  BrainCircuit,
  ExternalLink,
  Loader2,
  MoreVertical,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import {
  archiveKeywords,
  restoreKeywords,
} from "@/features/marketing/seo/keyword-research/data/queries";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { parseBingSiteBinding } from "@/features/marketing/bing/binding";
import { syncBingSearchPerformance } from "@/features/marketing/bing/service";
import { extractErrorMessage } from "@/utils/errors";
import { useAppDispatch } from "@/lib/redux/hooks";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { AgentCopyGroomerLauncher } from "@/components/agent-copy/AgentCopyGroomerLauncher";
import {
  groomerPresetVariants,
  type AgentCopyGroomerConfig,
  type AgentCopyGroomerSection,
} from "@/components/agent-copy/groomer-types";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import {
  formatCount as integer,
  formatDecimal as decimal,
  formatMoney as money,
  humanKeywordPerformanceList,
  humanKeywordPerformanceRow,
  humanMatchingQueriesStat,
  projectKeywordPerformanceRow,
  providerLabel,
} from "@/features/marketing/seo/keyword-research/format";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { buildSiteKeywordsScope } from "@/features/marketing/lib/scopes/site-keywords-scope";
import { KeywordCompetitionBadge } from "./KeywordMetrics";
import { SiteKeywordsWriteTargets } from "./SiteKeywordsWriteTargets";

import type { SiteKeywordPerformanceRow } from "../types";
import { useSiteKeywordPerformance } from "../useSiteKeywordPerformance";

export function SiteKeywordPerformanceWorkspace() {
  const { site, sitePath } = useMarketingSite();
  const dispatch = useAppDispatch();
  const openKeywordWindow = useOpenKeywordWindow();
  const table = useMarketingTableState({
    defaultSort: { id: "clicks", direction: "desc" },
    defaultPageSize: 50,
  });
  const performance = useSiteKeywordPerformance(site.id, table.queryState);
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const bingBinding = parseBingSiteBinding(site.integrations);
  const [syncingBing, setSyncingBing] = useState(false);

  /** Soft-archive the mapped library keyword (undoable). GSC/Bing query
   * evidence stays — only the seo.keyword library row is archived. */
  const archiveLibraryKeyword = async (row: SiteKeywordPerformanceRow) => {
    const keywordId = row.keyword_id;
    if (!keywordId) return;
    const phrase = row.query ?? "this keyword";
    const confirmed = await confirm({
      title: `Archive “${phrase}” from the keyword library?`,
      description:
        "The library row disappears from every keyword list and research runs won't re-add it. Search-performance evidence for the query is unaffected. Undo from the toast, or restore by typing the phrase anywhere.",
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      await archiveKeywords([keywordId]);
      await performance.refetch();
      toast.success(`Archived “${phrase}” from the library`, {
        action: {
          label: "Undo",
          onClick: () => {
            void restoreKeywords([keywordId])
              .then(() => {
                void performance.refetch();
                toast.success(`Restored “${phrase}”`);
              })
              .catch((error) => {
                toast.error("Could not restore the keyword", {
                  description: extractErrorMessage(error),
                });
              });
          },
        },
      });
    } catch (error) {
      toast.error("Could not archive the keyword", {
        description: extractErrorMessage(error),
      });
    }
  };

  const rowMenuConfig = (row: SiteKeywordPerformanceRow): ItemMenuConfig => ({
    header: { title: row.query ?? "Search query" },
    sections: [
      {
        items: [
          {
            id: "intel",
            label: "Keyword Intelligence",
            icon: BrainCircuit,
            onSelect: () => {
              openKeywordWindow({
                phrase: row.query ?? "",
                organizationId: site.organization_id,
                siteId: site.id,
                brandId: site.brand_id ?? undefined,
                tab: "site",
              });
            },
          },
        ],
      },
      {
        items: [
          {
            id: "archive-library",
            label: "Archive from library",
            icon: Archive,
            tone: "destructive",
            disabled: !row.keyword_id,
            disabledReason: row.keyword_id
              ? undefined
              : "This query has no mapped library keyword yet",
            onSelect: () => void archiveLibraryKeyword(row),
          },
        ],
      },
    ],
  });

  const runBingSync = async () => {
    setSyncingBing(true);
    try {
      await syncBingSearchPerformance(
        dispatch,
        site.id,
        site.organization_id,
      );
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

  const pageLocation = `Marketing — Organic keyword performance for ${site.domain}`;
  const rows = performance.data?.rows ?? [];
  const total = performance.data?.total ?? 0;

  // A failed read must never be able to render as "there is simply no data".
  // Two separate holes produced exactly that on 2026-08-09, when
  // seo.v_site_keyword_performance was 500ing with a statement timeout:
  //   1. the error state replaced the whole panel, so the operator lost the
  //      toolbar and filters and only ever saw a bare error page; and
  //   2. TanStack Query v5's `isLoading` is `isPending && isFetching`, so it
  //      goes FALSE during retry backoff while `data` is still undefined —
  //      the table fell through to its empty state and cheerfully advertised
  //      "No search queries stored yet — Connect Google Search Console…" over
  //      a site with 4,232 stored queries.
  // So: the error rides ABOVE still-usable chrome, the skeleton covers every
  // unsettled moment, and the reassuring empty state is gated on isSuccess.
  const loadFailed = performance.isError;
  const showSkeleton = performance.isPending && !loadFailed;

  const groomerSections = (): AgentCopyGroomerSection[] => [
    {
      id: "summary",
      title: "Summary",
      description: "Matching query count + active sources.",
      build: () => ({
        matching_queries: total,
        bing_connected: Boolean(bingBinding?.enabled),
        site: site.domain,
      }),
    },
    {
      id: "keyword_rows",
      title: "Keyword performance rows",
      description: `${rows.length} loaded of ${total} total (current table page + filters).`,
      cuttable: true,
      levelLabels: {
        full: `Loaded ${rows.length} (raw)`,
        compact: "Top 25 (key fields)",
        brief: "Counts only",
      },
      build: (level) =>
        level === "full"
          ? { query: table.state, rows }
          : level === "compact"
            ? {
                query: table.state,
                rows: rows.slice(0, 25).map(projectKeywordPerformanceRow),
              }
            : { total_recorded: total, loaded_rows: rows.length },
    },
  ];

  const pageFullData = (): Record<string, unknown> => {
    const full: Record<string, unknown> = {};
    for (const section of groomerSections()) {
      const value = section.build("full");
      if (value !== null && value !== undefined) full[section.id] = value;
    }
    return full;
  };

  const pageHuman = () =>
    [
      `Organic keyword performance — ${site.domain}`,
      humanMatchingQueriesStat(total, site.domain),
      humanKeywordPerformanceList(rows, total),
    ].join("\n\n");

  const pageAgentPayload = (): AgentPayloadInput => ({
    kind: "marketing-keyword-performance-page",
    location: pageLocation,
    description: `The full organic keyword performance workspace for ${site.domain}.`,
    data: pageFullData(),
    summary: humanMatchingQueriesStat(total, site.domain),
    attributes: { site_id: site.id, domain: site.domain },
  });

  const groomerConfig = (): AgentCopyGroomerConfig => ({
    label: `Keyword performance — ${site.domain}`,
    kind: "marketing-keyword-performance-page",
    location: pageLocation,
    description: `The full organic keyword performance workspace for ${site.domain}.`,
    attributes: { site_id: site.id, domain: site.domain },
    summary: humanMatchingQueriesStat(total, site.domain),
    sections: groomerSections(),
  });

  // Surface emitter — nested inside the site provider (deeper wins), built at
  // trigger time from the live table state and loaded rows.
  const getScope = () =>
    buildSiteKeywordsScope({
      base: getBaseValues(),
      siteDomain: site.domain,
      bingConnected: Boolean(bingBinding?.enabled),
      tableState: table.state,
      rows,
      total,
      loading: showSkeleton,
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-site-keywords"
      getScope={getScope}
    >
    <SiteKeywordsWriteTargets
      site={site}
      onEvidenceChanged={() => performance.refetch()}
    />
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
          <div className="group/stat relative rounded-md border border-border bg-muted/30 px-3 py-1.5 text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Matching queries
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {Intl.NumberFormat().format(total)}
            </p>
            <div className="absolute left-1 top-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/stat:opacity-100">
              <CopyButtons
                size="xs"
                label="Matching queries"
                human={() => humanMatchingQueriesStat(total, site.domain)}
                agent={() => ({
                  kind: "keyword-performance-summary",
                  location: pageLocation,
                  description: `Matching query count for ${site.domain}.`,
                  data: { matching_queries: total, site: site.domain },
                  summary: humanMatchingQueriesStat(total, site.domain),
                })}
              />
            </div>
          </div>
          <CopyButtons
            size="icon"
            label={`Keyword performance page (${site.domain})`}
            human={pageHuman}
            json={pageFullData}
            agent={pageAgentPayload}
            aiVariants={groomerPresetVariants(groomerConfig)}
          />
          <AgentCopyGroomerLauncher config={groomerConfig} />
        </div>
      </section>

      {loadFailed ? (
        <InlineQueryError
          what="keyword performance"
          error={performance.error}
          onRetry={() => void performance.refetch()}
        />
      ) : null}

      <section className="min-h-[36rem] rounded-lg border border-border bg-card p-2">
        <MatrxDataTable<SiteKeywordPerformanceRow>
          data={rows}
          columns={columns}
          getRowId={(row) =>
            `${row.provider ?? "gsc"}:${row.keyword_id ?? "unmapped"}:${row.query ?? "unknown"}`
          }
          isLoading={showSkeleton}
          isFetching={performance.isFetching}
          query={{
            mode: "controlled",
            state: table.state,
            totalItems: total,
            onStateChange: table.onStateChange,
          }}
          toolbar={{ searchPlaceholder: "Search query or ranking page…" }}
          copy={{
            label: "Keyword",
            listLabel: "Keyword performance view",
            location: pageLocation,
            rowKind: "keyword-performance",
            listKind: "keyword-performance-rows",
            humanRow: humanKeywordPerformanceRow,
            agentRow: projectKeywordPerformanceRow,
            rowAttributes: (row) => ({
              provider: row.provider ?? undefined,
              query: row.query ?? undefined,
              workflow_status: row.workflow_status ?? undefined,
            }),
            listAttributes: (visible) => ({
              page: table.state.page,
              loaded_rows: visible.length,
              total_recorded: total,
              search: table.state.search || undefined,
            }),
          }}
          rowActions={(row) => (
            <div
              className="flex items-center gap-0.5"
              onClick={(event) => event.stopPropagation()}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-primary"
                aria-label="Keyword Intelligence"
                title="Keyword Intelligence"
                onClick={() => {
                  openKeywordWindow({
                    phrase: row.query ?? "",
                    organizationId: site.organization_id,
                    siteId: site.id,
                    brandId: site.brand_id ?? undefined,
                    tab: "site",
                  });
                }}
              >
                <BrainCircuit className="h-3.5 w-3.5" />
              </Button>
              <ItemMenu config={() => rowMenuConfig(row)}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  aria-label={`Options for ${row.query ?? "search query"}`}
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </ItemMenu>
            </div>
          )}
          window={{
            title: (row) => row.query ?? "Search query",
          }}
          emptyState={
            loadFailed
              ? {
                  icon: (
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                  ),
                  title: "Keyword performance could not be loaded",
                  description:
                    "This site's stored queries could not be read — this is a failed request, not an empty site. Retry above.",
                }
              : {
                  icon: <Search className="h-8 w-8 text-muted-foreground" />,
                  title: "No search queries stored yet",
                  description:
                    "Connect Google Search Console or Bing Webmaster and run a search-performance sync to populate this site.",
                }
          }
          detail={{
            title: (row) => row.query ?? "Search query",
            description: (row) =>
              `${integer(row.clicks)} clicks · ${integer(row.impressions)} impressions`,
          }}
        />
      </section>
    </main>
    </SurfaceRuntimeProvider>
  );
}
