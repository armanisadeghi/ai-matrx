"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleGauge, ListChecks, Loader2, RefreshCw } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { AgentCopyGroomerLauncher } from "@/components/agent-copy/AgentCopyGroomerLauncher";
import type {
  AgentCopyGroomerConfig,
  AgentCopyGroomerSection,
} from "@/components/agent-copy/groomer-types";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import {
  FINDING_STATUS_OPTIONS,
  FindingStatusBadge,
  SEVERITY_OPTIONS,
  SeverityBadge,
  SUBJECT_TYPE_OPTIONS,
} from "@/features/marketing/components/analysis/AnalysisBadges";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingFindingsScope } from "@/features/surfaces/manifests/marketing-findings.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import {
  formatCompactDate,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { useSiteFindings } from "@/features/marketing/data/analysis-hooks";
import type {
  FindingListRow,
} from "@/features/marketing/data/analysis-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";

function humanFindingRow(row: FindingListRow): string {
  return humanLines([
    ["Finding", row.id],
    ["Item", row.item_key],
    ["Category", `${row.category} / ${row.subcategory}`],
    ["Severity", row.severity],
    ["Lifecycle", row.status],
    ["Subject", row.subject_type],
    ["Page", row.page_path ?? (row.page_id ? row.page_id : "site-level")],
    ["Page URL", row.page_url],
    ["Suppressed", row.suppressed ? "yes" : "no"],
    ["Last detected", formatCompactDate(row.last_detected_at)],
  ]);
}

function projectFindingRow(row: FindingListRow) {
  return {
    id: row.id,
    item_key: row.item_key,
    category: row.category,
    subcategory: row.subcategory,
    severity: row.severity,
    status: row.status,
    subject_type: row.subject_type,
    page_path: row.page_path,
    suppressed: row.suppressed,
    last_detected_at: row.last_detected_at,
  };
}

export function FindingsTable() {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const { site, sitePath } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const table = useMarketingTableState({
    defaultSort: { id: "last_detected_at", direction: "desc" },
  });
  const findings = useSiteFindings(site.id, table.queryState);

  const buildActiveFilters = (): Record<string, unknown> | undefined => {
    const current = table.state;
    const filters: Record<string, unknown> = {};
    if (current.search) filters.search = current.search;
    if (current.anyOf) filters.any_of = current.anyOf;
    for (const [column, filter] of Object.entries(current.columnFilters)) {
      if (!filter) continue;
      filters[column] =
        filter.kind === "number"
          ? { min: filter.min ?? null, max: filter.max ?? null }
          : filter.value;
    }
    return Object.keys(filters).length > 0 ? filters : undefined;
  };
  const columns: MatrxColumnDef<FindingListRow>[] = [
    {
      id: "item_key",
      accessorKey: "item_key",
      header: "Finding",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <div className="min-w-64 max-w-xl">
          <p className="truncate font-mono text-[11px] font-medium text-foreground">
            {row.item_key}
          </p>
          <p className="truncate text-[10px] capitalize text-muted-foreground">
            {row.category} / {row.subcategory}
          </p>
        </div>
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
      id: "status",
      accessorKey: "status",
      header: "Lifecycle",
      filter: "select",
      filterOptions: FINDING_STATUS_OPTIONS,
      cell: (row) => <FindingStatusBadge value={row.status} />,
    },
    {
      id: "subject_type",
      accessorKey: "subject_type",
      header: "Subject",
      filter: "select",
      filterOptions: SUBJECT_TYPE_OPTIONS,
      cell: (row) => (
        <span className="text-xs capitalize">{row.subject_type}</span>
      ),
    },
    {
      id: "page_id",
      accessorKey: "page_id",
      header: "Page",
      filter: false,
      sortable: false,
      cell: (row) => (
        <div className="min-w-48 max-w-lg">
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
    {
      id: "suppressed",
      accessorKey: "suppressed",
      header: "Suppressed",
      filter: "boolean",
      sortable: false,
      cell: (row) => (
        <Badge variant={row.suppressed ? "warning" : "outline"}>
          {row.suppressed ? "Yes" : "No"}
        </Badge>
      ),
    },
    {
      id: "last_detected_at",
      accessorKey: "last_detected_at",
      header: "Last detected",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.last_detected_at)}
        </span>
      ),
    },
  ];

  if (findings.isError) {
    return (
      <QueryError
        error={findings.error}
        onRetry={() => void findings.refetch()}
      />
    );
  }

  const navigate = (href: string) => {
    if (isNavigating) return;
    startNavigation(() => router.push(href));
  };

  const pageLocation = webLocation(`Findings register — ${site.root_url}`);
  const rows = findings.data?.rows ?? [];
  const total = findings.data?.total ?? 0;

  const groomerSections = (): AgentCopyGroomerSection[] => [
    {
      id: "findings",
      title: "Findings",
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
            ? { query: table.state, rows: rows.slice(0, 25).map(projectFindingRow) }
            : {
                total_matching: total,
                loaded_rows: rows.length,
                by_severity: rows.reduce<Record<string, number>>((acc, row) => {
                  acc[row.severity] = (acc[row.severity] ?? 0) + 1;
                  return acc;
                }, {}),
              },
    },
  ];

  const pageHuman = () =>
    [
      `Findings register — ${site.domain}`,
      `${total.toLocaleString()} matching findings (${rows.length} loaded).`,
      ...rows.slice(0, 25).map(humanFindingRow),
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
    kind: "marketing-findings-page",
    location: pageLocation,
    description: `The findings register for ${site.domain}.`,
    data: pageFullData(),
    attributes: { site_id: site.id, total_matching: total },
  });

  const groomerConfig = (): AgentCopyGroomerConfig => ({
    label: `Findings — ${site.domain}`,
    kind: "marketing-findings-page",
    location: pageLocation,
    description: `The full findings register for ${site.domain}.`,
    attributes: { site_id: site.id, domain: site.domain },
    sections: groomerSections(),
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-findings"
      getScope={() =>
        createMarketingFindingsScope({
          ...getBaseValues(),
          findings_total: findings.data?.total,
          active_filters: buildActiveFilters(),
        })
      }
    >
    <main className="h-full overflow-hidden bg-textured p-3 sm:p-4">
      <MatrxDataTable<FindingListRow>
        data={findings.data?.rows ?? []}
        columns={columns}
        getRowId={(row) => row.id}
        isLoading={findings.isLoading}
        isFetching={findings.isFetching || isNavigating}
        query={{
          mode: "controlled",
          state: table.state,
          totalItems: findings.data?.total ?? 0,
          onStateChange: table.onStateChange,
        }}
        toolbar={{
          searchPlaceholder:
            "Search item, category, subcategory, or suppression reason…",
          actions: (
            <div className="flex items-center gap-2">
              <CopyButtons
                size="icon"
                label={`Findings register (${site.domain})`}
                human={pageHuman}
                json={pageFullData}
                agent={pageAgentPayload}
              />
              <AgentCopyGroomerLauncher config={groomerConfig} />
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void findings.refetch()}
                disabled={findings.isFetching}
              >
                <RefreshCw
                  className={
                    findings.isFetching
                      ? "h-3.5 w-3.5 animate-spin"
                      : "h-3.5 w-3.5"
                  }
                />
                Refresh
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => navigate(`${sitePath}/analysis`)}
                disabled={isNavigating}
              >
                {isNavigating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CircleGauge className="h-3.5 w-3.5" />
                )}
                Priority
              </Button>
            </div>
          ),
        }}
        copy={{
          label: "Finding",
          listLabel: "All findings",
          location: webLocation(`Findings register — ${site.root_url}`),
          rowKind: "web-finding",
          listKind: "web-findings-list",
          rowDescription:
            "One durable finding lifecycle record from this site's register.",
          listDescription:
            "The currently loaded finding rows (respecting search, filters, sort, and pagination).",
          humanRow: humanFindingRow,
          rowAttributes: (row) => ({
            finding_id: row.id,
            site_id: site.id,
            item_key: row.item_key,
            severity: row.severity,
            status: row.status,
          }),
          listAttributes: () => ({
            site_id: site.id,
            total_matching: findings.data?.total ?? 0,
          }),
        }}
        detail={{ enabled: false }}
        onRowOpen={(row) =>
          navigate(`${sitePath}/findings/${row.id}`)
        }
        emptyState={{
          icon: <ListChecks className="h-8 w-8 text-muted-foreground" />,
          title: "No findings match this view",
          description:
            "Findings are durable lifecycle state derived from analysis results. Clear filters to include resolved or suppressed records.",
        }}
      />
    </main>
    </SurfaceRuntimeProvider>
  );
}
