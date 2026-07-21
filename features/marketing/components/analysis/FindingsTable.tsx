"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleGauge, ListChecks, Loader2, RefreshCw } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FINDING_STATUS_OPTIONS,
  FindingStatusBadge,
  SEVERITY_OPTIONS,
  SeverityBadge,
  SUBJECT_TYPE_OPTIONS,
} from "@/features/marketing/components/analysis/AnalysisBadges";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  formatCompactDate,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { useSiteFindings } from "@/features/marketing/data/analysis-hooks";
import type { FindingListRow } from "@/features/marketing/data/analysis-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";

export function FindingsTable() {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const { site, sitePath } = useMarketingSite();
  const table = useMarketingTableState({
    defaultSort: { id: "last_detected_at", direction: "desc" },
  });
  const findings = useSiteFindings(site.id, table.queryState);
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

  return (
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
          humanRow: (row) =>
            humanLines([
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
            ]),
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
  );
}
