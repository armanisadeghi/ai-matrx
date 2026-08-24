"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import type {
  CellEditsMap,
  MatrxColumnDef,
} from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  BING_PROVIDER,
  GOOGLE_SEARCH_CONSOLE_PROVIDER,
} from "@/features/marketing/lib/provider-names";
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
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { getGscKeywordValueFor } from "@/features/marketing/search-console/data-insights";
import { buildGscValueColumns } from "@/features/marketing/search-console/lib/columns";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import {
  keywordEntityRef,
  useKeywordAssignSurfaces,
  useKeywordMenuSection,
} from "@/features/marketing/seo/keyword/keyword-actions";
import { KeywordCompetitionBadge } from "./KeywordMetrics";
import {
  SITE_KEYWORDS_SURFACE_NAME,
  SiteKeywordsWriteTargets,
} from "./SiteKeywordsWriteTargets";

import type { SiteKeywordPerformanceRow } from "../types";
import { useSiteKeywordPerformance } from "../useSiteKeywordPerformance";
import { updateSiteKeywordWorkflow } from "../data/site-performance";
import {
  isEditableKeywordWorkflowStatus,
  isKeywordWorkflowStatus,
  KEYWORD_WORKFLOW_EDIT_OPTIONS,
  KEYWORD_WORKFLOW_FILTER_OPTIONS,
  keywordWorkflowStage,
} from "../workflow-status";

function performanceRowId(row: SiteKeywordPerformanceRow): string {
  return `${row.provider ?? "gsc"}:${row.keyword_id ?? "unmapped"}:${row.query ?? "unknown"}`;
}

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

  const saveWorkflowEdits = async (
    edits: CellEditsMap,
    currentRows: SiteKeywordPerformanceRow[],
  ) => {
    const rowsById = new Map(
      currentRows.map((row) => [performanceRowId(row), row]),
    );
    const updatesByKeyword = new Map<
      string,
      Parameters<typeof updateSiteKeywordWorkflow>[0]
    >();

    for (const [rowId, fields] of Object.entries(edits)) {
      if (!Object.hasOwn(fields, "workflow_status")) continue;
      const row = rowsById.get(rowId);
      if (!row?.keyword_id) {
        throw new Error(
          "This search query is not mapped to the keyword library, so its SEO stage cannot be changed yet.",
        );
      }
      const nextStatus = fields.workflow_status;
      if (!isEditableKeywordWorkflowStatus(nextStatus)) {
        throw new Error("Choose a supported SEO stage and try again.");
      }
      const expectedStatus = row.workflow_status;
      if (expectedStatus !== null && !isKeywordWorkflowStatus(expectedStatus)) {
        throw new Error(
          `“${row.query ?? "This keyword"}” has an unrecognized SEO stage and cannot be edited here.`,
        );
      }
      const existing = updatesByKeyword.get(row.keyword_id);
      if (existing && existing.nextStatus !== nextStatus) {
        throw new Error(
          `“${row.query ?? "This keyword"}” was assigned two different stages. Choose one stage and try again.`,
        );
      }
      updatesByKeyword.set(row.keyword_id, {
        organizationId: site.organization_id,
        siteId: site.id,
        keywordId: row.keyword_id,
        expectedStatus,
        nextStatus,
      });
    }

    try {
      for (const update of updatesByKeyword.values()) {
        await updateSiteKeywordWorkflow(update);
      }
    } finally {
      await performance.refetch();
    }
  };

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

  const rows = performance.data?.rows ?? [];
  const total = performance.data?.total ?? 0;

  /**
   * THE SCOPE RULE: ask for the keywords being rendered, never the site.
   * Keyed on the ids on screen so paging/filtering re-reads exactly once.
   */
  const keywordIds = [
    ...new Set(rows.flatMap((row) => (row.keyword_id ? [row.keyword_id] : []))),
  ];
  const values = useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "keyword-value-for",
      site.id,
      keywordIds.join(","),
    ],
    queryFn: ({ signal }) => getGscKeywordValueFor(site.id, keywordIds, signal),
    enabled: keywordIds.length > 0,
    staleTime: 60_000,
  });
  const valueFor = values.data ?? new Map();

  const surfaces = useKeywordAssignSurfaces({ siteId: site.id });
  const clickedRow = useRef<SiteKeywordPerformanceRow | null>(null);
  const keywordSection = useKeywordMenuSection({
    siteId: site.id,
    siteName: site.domain,
    brandId: site.brand_id,
    organizationId: site.organization_id,
    surfaces,
    getRow: () => {
      const row = clickedRow.current;
      if (!row?.query) return null;
      const value = row.keyword_id ? valueFor.get(row.keyword_id) : undefined;
      return {
        phrase: row.query,
        keywordId: row.keyword_id ?? null,
        currentLevel: value?.value_band ?? null,
        levelIsRuling: value?.value_source === "override",
      };
    },
  });

  const columns: MatrxColumnDef<SiteKeywordPerformanceRow>[] = [
    {
      id: "provider",
      accessorKey: "provider",
      header: "Source",
      filter: "select",
      filterOptions: [
        { value: "gsc", label: GOOGLE_SEARCH_CONSOLE_PROVIDER.label },
        { value: "bing_webmaster", label: BING_PROVIDER.label },
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
    // C6 — Class · Score · Level for exactly the rows on screen, from the ONE
    // resolver (`seo.gsc_keyword_value_for`). Identical definition to the
    // Queries breakdown and Dig Here: `buildGscValueColumns`, never a copy.
    // Before 2026-08-24 this tab showed 4,355 keywords with none of them,
    // one tab away from the Keyword Workbench that shows all three.
    ...buildGscValueColumns<SiteKeywordPerformanceRow>(
      (row) => (row.keyword_id ? valueFor.get(row.keyword_id) : undefined),
      { siteId: site.id, brandId: site.brand_id, keywordOf: (row) => row.query },
    ),
    {
      id: "workflow_status",
      accessorKey: "workflow_status",
      header: "SEO stage",
      filter: "select",
      filterOptions: KEYWORD_WORKFLOW_FILTER_OPTIONS,
      editable: "select",
      editableIf: (row) => Boolean(row.keyword_id),
      editOptions: KEYWORD_WORKFLOW_EDIT_OPTIONS,
      cell: (row) => {
        const stage = keywordWorkflowStage(row.workflow_status);
        return row.workflow_status ? (
          <span title={stage.description}>
            <Badge variant="outline">{stage.label}</Badge>
          </span>
        ) : (
          <span className="text-muted-foreground" title={stage.description}>
            {stage.label}
          </span>
        );
      },
    },
  ];

  const pageLocation = `Marketing — Organic keyword performance for ${site.domain}`;

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
      surfaceName={SITE_KEYWORDS_SURFACE_NAME}
      getScope={getScope}
    >
    <SiteKeywordsWriteTargets
      site={site}
      onEvidenceChanged={() => performance.refetch()}
    />
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-textured p-3 sm:p-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" />
            Organic keyword performance
          </h1>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            28-day query performance for {site.domain} from{" "}
            {GOOGLE_SEARCH_CONSOLE_PROVIDER.label} and {BING_PROVIDER.label},
            with market data and editable SEO stages.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
              <Link href={marketingRoutes.connectionsBing()}>Connect Bing</Link>
            </Button>
          )}
          <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Matching queries
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {Intl.NumberFormat().format(total)}
            </span>
          </div>
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

      {/* The shared assignment surfaces the right-click menu opens. Inline,
          never inside a Dialog — the value picker portals its own popover. */}
      {surfaces.isOpen ? surfaces.node : null}

      {/*
        ONE v3 menu around the whole pane (never one per row). Until
        2026-08-24 this tab — 4,355 keywords, one tab away from the Keyword
        Workbench — had no right-click at all, so nothing this system knows
        about a keyword could be seen or set from here.
      */}
      <NonEditableContextMenu
        sourceFeature="marketing"
        surfaceName={SITE_KEYWORDS_SURFACE_NAME}
        contentSource={{ type: "raw" }}
        // The surface's declared values ride along (same emitter the page
        // provider uses), so an agent launched from a row sees the surface's
        // values, not an empty scope.
        contextData={{ ...getScope(), content: "" }}
        resolveContextOnOpen={(target) => {
          const id = target
            ?.closest("[data-row-id]")
            ?.getAttribute("data-row-id");
          const row =
            (id && rows.find((r) => performanceRowId(r) === id)) || null;
          clickedRow.current = row;
          if (!row) return null;
          return {
            content: humanKeywordPerformanceRow(row),
            keyword: row.query ?? "",
            keyword_id: row.keyword_id ?? "",
            // The RIGHT-CLICKED row owns Attach To — one menu, N rows, so the
            // pane can never be the target (`CONTEXT_MENU_ENTITY_KEY`).
            [CONTEXT_MENU_ENTITY_KEY]: keywordEntityRef({
              phrase: row.query ?? "",
              keywordId: row.keyword_id ?? null,
            }),
          };
        }}
        extraSections={[keywordSection]}
      >
      <section className="min-h-[36rem] rounded-lg border border-border bg-card p-2">
        <MatrxDataTable<SiteKeywordPerformanceRow>
          data={rows}
          columns={columns}
          getRowId={performanceRowId}
          isLoading={showSkeleton}
          isFetching={performance.isFetching}
          query={{
            mode: "controlled",
            state: table.state,
            totalItems: total,
            onStateChange: table.onStateChange,
          }}
          toolbar={{ searchPlaceholder: "Search query or ranking page…" }}
          edit={{ enabled: true, onSave: saveWorkflowEdits }}
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
          /*
           * NO DEAD ENDS + THE MISMATCH RULE. A row click used to open the
           * default inspector, which showed a non-technical SME bare
           * `SITE_ID` / `ORGANIZATION_ID` / `KEYWORD_ID` / `TOP_PAGE_ID`
           * UUIDs. It now opens the shared Keyword Intelligence dossier —
           * the same window every other keyword surface opens.
           */
          detail={{ enabled: false }}
          onRowOpen={(row) =>
            openKeywordWindow({
              phrase: row.query ?? "",
              organizationId: site.organization_id,
              siteId: site.id,
              brandId: site.brand_id ?? undefined,
              tab: "overview",
            })
          }
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
                    "Connect GSC or Bing and run a search-performance sync to populate this site.",
                }
          }
        />
      </section>
      </NonEditableContextMenu>
    </main>
    </SurfaceRuntimeProvider>
  );
}
