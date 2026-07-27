"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleGauge, ListChecks, Loader2, RefreshCw } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { AgentCopyGroomerLauncher } from "@/components/agent-copy/AgentCopyGroomerLauncher";
import type {
  AgentCopyGroomerConfig,
  AgentCopyGroomerSection,
} from "@/components/agent-copy/groomer-types";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import {
  SEVERITY_OPTIONS,
  SeverityBadge,
} from "@/features/marketing/components/analysis/AnalysisBadges";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingAnalysisScope } from "@/features/surfaces/manifests/marketing-analysis.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import {
  countRowsBy,
  tableFilterValues,
  tablePagination,
  tableSortLabel,
  tableViewState,
} from "@/features/marketing/lib/scopes/table-view-values";
import { QueryError } from "@/features/marketing/components/shared/MarketingUi";
import { useSitePriorityQueue } from "@/features/marketing/data/analysis-hooks";
import type { PriorityQueueRow } from "@/features/marketing/data/analysis-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";

function humanPriorityRow(row: PriorityQueueRow): string {
  return humanLines([
    ["Priority", row.priority === null ? null : Number(row.priority).toFixed(2)],
    ["Severity", row.severity],
    ["Item", row.item_key],
    ["Category", row.category],
    ["Subcategory", row.subcategory],
    ["Page", row.page_path ?? (row.page_id ? row.page_id : "site-level")],
    ["Page URL", row.page_url],
  ]);
}

function projectPriorityRow(row: PriorityQueueRow) {
  return {
    priority: row.priority,
    severity: row.severity,
    item_key: row.item_key,
    category: row.category,
    subcategory: row.subcategory,
    page_path: row.page_path,
  };
}

function filteredFindingsHref(basePath: string, row: PriorityQueueRow) {
  const params = new URLSearchParams();
  if (row.item_key) params.set("f_item_key", `text:${row.item_key}`);
  if (row.item_id) params.set("f_item_id", `text:${row.item_id}`);
  if (row.page_id) params.set("f_page_id", `text:${row.page_id}`);
  const query = params.toString();
  return `${basePath}/findings${query ? `?${query}` : ""}`;
}

export function SiteAnalysisTable() {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const { site, sitePath } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const table = useMarketingTableState({
    defaultSort: { id: "priority", direction: "desc" },
  });
  const priority = useSitePriorityQueue(site.id, table.queryState);
  const columns: MatrxColumnDef<PriorityQueueRow>[] = [
    {
      id: "priority",
      accessorKey: "priority",
      header: "Priority",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-xs font-semibold tabular-nums">
          {row.priority === null ? "—" : Number(row.priority).toFixed(2)}
        </span>
      ),
    },
    {
      id: "severity",
      accessorKey: "severity",
      header: "Severity",
      filter: "select",
      filterOptions: SEVERITY_OPTIONS,
      sortable: false,
      cell: (row) => <SeverityBadge value={row.severity} />,
    },
    {
      id: "item_key",
      accessorKey: "item_key",
      header: "Analysis item",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block min-w-56 max-w-md truncate font-mono text-[11px] font-medium">
          {row.item_key || "Unknown item"}
        </span>
      ),
    },
    {
      id: "category",
      accessorKey: "category",
      header: "Category",
      filter: "text",
      cell: (row) => (
        <span className="block max-w-48 truncate text-xs capitalize">
          {row.category || "—"}
        </span>
      ),
    },
    {
      id: "subcategory",
      accessorKey: "subcategory",
      header: "Subcategory",
      filter: "text",
      cell: (row) => (
        <span className="block max-w-48 truncate text-xs capitalize">
          {row.subcategory || "—"}
        </span>
      ),
    },
    {
      id: "page_id",
      accessorKey: "page_id",
      header: "Affected page",
      filter: false,
      sortable: false,
      cell: (row) => (
        <div className="min-w-52 max-w-lg">
          <p className="truncate font-mono text-[11px]">
            {row.page_path ||
              (row.page_id ? row.page_id.slice(0, 12) : "Site-level")}
          </p>
          {row.page_url ? (
            <p className="truncate text-[10px] text-muted-foreground">
              {row.page_url}
            </p>
          ) : null}
        </div>
      ),
    },
  ];

  if (priority.isError) {
    return (
      <QueryError
        error={priority.error}
        onRetry={() => void priority.refetch()}
      />
    );
  }

  const navigate = (href: string) => {
    if (isNavigating) return;
    startNavigation(() => router.push(href));
  };

  const pageLocation = webLocation(
    `Analysis priority queue — ${site.root_url}`,
  );
  const rows = priority.data?.rows ?? [];
  const total = priority.data?.total ?? 0;

  const groomerSections = (): AgentCopyGroomerSection[] => [
    {
      id: "priority_queue",
      title: "Priority queue",
      description: `${rows.length} loaded of ${total.toLocaleString()} matching (current filters, sort, and page).`,
      levelLabels: {
        full: `Loaded ${rows.length} (raw)`,
        compact: "Top 25 (key fields)",
        brief: "Counts only",
      },
      build: (level) =>
        level === "full"
          ? { query: table.state, rows }
          : level === "compact"
            ? { query: table.state, rows: rows.slice(0, 25).map(projectPriorityRow) }
            : {
                total_matching: total,
                loaded_rows: rows.length,
                by_severity: rows.reduce<Record<string, number>>((acc, row) => {
                  const key = row.severity ?? "unknown";
                  acc[key] = (acc[key] ?? 0) + 1;
                  return acc;
                }, {}),
              },
    },
  ];

  const pageHuman = () =>
    [
      `Analysis priority queue — ${site.domain}`,
      `${total.toLocaleString()} matching items (${rows.length} loaded).`,
      ...rows.slice(0, 25).map(humanPriorityRow),
    ].join("\n\n");

  const pageFullData = (): Record<string, unknown> => {
    const full: Record<string, unknown> = {};
    for (const section of groomerSections()) {
      const value = section.build("full");
      if (value !== null && value !== undefined) full[section.id] = value;
    }
    return full;
  };

  const pageAgentPayload = (): AgentPayloadInput => ({
    kind: "marketing-analysis-page",
    location: pageLocation,
    description: `The analysis priority queue for ${site.domain}.`,
    data: pageFullData(),
    attributes: { site_id: site.id, total_matching: total },
  });

  const groomerConfig = (): AgentCopyGroomerConfig => ({
    label: `Analysis — ${site.domain}`,
    kind: "marketing-analysis-page",
    location: pageLocation,
    description: `The full analysis priority queue for ${site.domain}.`,
    attributes: { site_id: site.id, domain: site.domain },
    sections: groomerSections(),
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-analysis"
      getScope={() => {
        const liveRows = priority.data?.rows ?? [];
        const liveTotal = priority.data?.total;
        const bySeverity = countRowsBy(liveRows, (row) => row.severity);
        const byCategory = countRowsBy(liveRows, (row) => row.category);
        const loaded = priority.data ? liveRows.length : undefined;
        return createMarketingAnalysisScope({
          ...getBaseValues(),
          queue_total: liveTotal,
          queue_rows_loaded: loaded,
          queue_severity_counts: bySeverity,
          queue_category_counts: byCategory,
          queue_summary: priority.data
            ? {
                total_matching: liveTotal ?? 0,
                rows_loaded: liveRows.length,
                by_severity: bySeverity ?? {},
                by_category: byCategory ?? {},
              }
            : undefined,
          active_filters: tableFilterValues(table.state),
          queue_sort: tableSortLabel(table.state),
          queue_pagination: tablePagination(table.state),
          queue_view_state: tableViewState(table.state),
          top_queue_items:
            liveRows.length > 0
              ? liveRows.slice(0, 10).map((row) => ({
                  item_key: row.item_key,
                  category: row.category,
                  subcategory: row.subcategory,
                  severity: row.severity,
                  priority: row.priority,
                  page_path: row.page_path,
                  page_url: row.page_url,
                }))
              : undefined,
        });
      }}
    >
    <main
      data-surface-value="top_queue_items"
      className="h-full overflow-hidden bg-textured p-3 sm:p-4"
    >
      <MatrxDataTable<PriorityQueueRow>
        data={priority.data?.rows ?? []}
        columns={columns}
        getRowId={(row) => row.row_key}
        isLoading={priority.isLoading}
        isFetching={priority.isFetching || isNavigating}
        query={{
          mode: "controlled",
          state: table.state,
          totalItems: priority.data?.total ?? 0,
          onStateChange: table.onStateChange,
        }}
        toolbar={{
          searchPlaceholder: "Search item, category, or subcategory…",
          actions: (
            <div className="flex items-center gap-2">
              <CopyButtons
                size="icon"
                label={`Analysis priority queue (${site.domain})`}
                human={pageHuman}
                json={pageFullData}
                agent={pageAgentPayload}
              />
              <AgentCopyGroomerLauncher config={groomerConfig} />
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void priority.refetch()}
                disabled={priority.isFetching}
              >
                <RefreshCw
                  className={
                    priority.isFetching
                      ? "h-3.5 w-3.5 animate-spin"
                      : "h-3.5 w-3.5"
                  }
                />
                Refresh
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => navigate(`${sitePath}/findings`)}
                disabled={isNavigating}
              >
                {isNavigating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ListChecks className="h-3.5 w-3.5" />
                )}
                Findings
              </Button>
            </div>
          ),
        }}
        copy={{
          label: "Priority item",
          listLabel: "Priority queue",
          location: webLocation(`Analysis priority queue — ${site.root_url}`),
          rowKind: "web-priority-queue-row",
          listKind: "web-priority-queue",
          rowDescription:
            "One open, non-suppressed finding projection ranked by weight × severity × confidence.",
          listDescription:
            "The currently loaded priority queue rows (respecting search, filters, sort, and pagination).",
          humanRow: humanPriorityRow,
          rowAttributes: (row) => ({
            site_id: site.id,
            item_id: row.item_id,
            item_key: row.item_key,
            page_id: row.page_id,
            severity: row.severity,
          }),
          listAttributes: () => ({
            site_id: site.id,
            total_matching: priority.data?.total ?? 0,
          }),
        }}
        detail={{ enabled: false }}
        onRowOpen={(row) => navigate(filteredFindingsHref(sitePath, row))}
        emptyState={{
          icon: <CircleGauge className="h-8 w-8 text-muted-foreground" />,
          title: "No prioritized findings",
          description:
            "The priority queue includes only open, non-suppressed findings. Analysis results will populate it after providers run.",
        }}
      />
    </main>
    </SurfaceRuntimeProvider>
  );
}
