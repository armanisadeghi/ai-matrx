"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Loader2 } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { RefreshCwTapButton } from "@/components/icons/tap-buttons";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingBatchesScope } from "@/features/surfaces/manifests/marketing-batches.manifest";
import {
  formatCompactDate,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";
import { useBatches } from "@/features/marketing/data/operations-hooks";
import type { OperationsBatchRow } from "@/features/marketing/data/operations-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";

const BATCH_STATUS_OPTIONS = [
  { value: "queued", label: "Queued" },
  { value: "submitted", label: "Submitted" },
  { value: "processing", label: "Processing" },
  { value: "complete", label: "Complete" },
  { value: "failed", label: "Failed" },
];

const BATCH_KIND_OPTIONS = [
  { value: "llm", label: "LLM" },
  { value: "vision", label: "Vision" },
];

export function BatchesTable() {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const table = useMarketingTableState({
    defaultSort: { id: "created_at", direction: "desc" },
    defaultPageSize: 50,
  });
  const batches = useBatches(table.queryState);
  const columns: MatrxColumnDef<OperationsBatchRow>[] = [
    {
      id: "created_at",
      accessorKey: "created_at",
      header: "Created",
      filter: false,
      cell: (row) => (
        <div className="whitespace-nowrap">
          <p className="text-xs font-medium">
            {formatCompactDate(row.created_at)}
          </p>
          <Link
            href={`/marketing/batches/${row.id}`}
            onClick={(event) => event.stopPropagation()}
            className="font-mono text-[10px] text-primary"
          >
            {row.id.slice(0, 12)}
          </Link>
        </div>
      ),
    },
    {
      id: "site",
      header: "Site",
      filter: false,
      sortable: false,
      cell: (row) => (
        <Link
          href={`/marketing/sites/${row.site_id}`}
          onClick={(event) => event.stopPropagation()}
          className="block min-w-44 max-w-64 hover:text-primary"
        >
          <span className="block truncate text-xs font-medium">
            {row.site?.name ?? row.site_id}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {row.site?.domain ?? "Site details"}
          </span>
        </Link>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      filterOptions: BATCH_STATUS_OPTIONS,
      cell: (row) => <StatusBadge value={row.status} />,
    },
    {
      id: "kind",
      accessorKey: "kind",
      header: "Kind",
      filter: "select",
      filterOptions: BATCH_KIND_OPTIONS,
      cell: (row) => <span className="text-xs uppercase">{row.kind}</span>,
    },
    {
      id: "provider",
      header: "Provider",
      filter: false,
      sortable: false,
      cell: (row) => (
        <div className="min-w-36 max-w-56">
          <p className="truncate text-xs">{row.provider?.label ?? "—"}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {row.provider?.key ?? row.provider_id}
          </p>
        </div>
      ),
    },
    {
      id: "submitted_at",
      accessorKey: "submitted_at",
      header: "Submitted",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.submitted_at)}
        </span>
      ),
    },
    {
      id: "completed_at",
      accessorKey: "completed_at",
      header: "Completed",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.completed_at)}
        </span>
      ),
    },
    {
      id: "external_ref",
      accessorKey: "external_ref",
      header: "External ref",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block max-w-52 truncate font-mono text-[11px]">
          {row.external_ref || "—"}
        </span>
      ),
    },
    {
      id: "error",
      accessorKey: "error",
      header: "Error",
      filter: false,
      sortable: false,
      cellKind: "text",
      cell: (row) => (
        <span className="block max-w-56 truncate text-xs text-destructive">
          {row.error || "—"}
        </span>
      ),
    },
  ];

  const openBatch = (row: OperationsBatchRow) => {
    if (isNavigating) return;
    startNavigation(() => router.push(`/marketing/batches/${row.id}`));
  };

  // Surface scope — assembled at trigger time from the already-loaded list
  // rows (respecting search/filters/sort/page), capped at 20.
  const getBatchesScope = () => {
    const rows = batches.data?.rows ?? [];
    return createMarketingBatchesScope({
      recent_batches:
        rows.length > 0
          ? rows.slice(0, 20).map((row) => ({
              id: row.id,
              status: row.status,
              kind: row.kind,
              site: row.site?.domain ?? row.site_id,
              provider:
                row.provider?.label ?? row.provider?.key ?? row.provider_id,
              created_at: row.created_at,
              completed_at: row.completed_at,
              error: row.error,
            }))
          : undefined,
      batch_total: batches.data?.total,
      list_query: {
        search: table.state.search,
        column_filters: table.state.columnFilters,
        sort: table.state.sort,
        page: table.state.page,
        page_size: table.state.pageSize,
      },
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-batches"
      getScope={getBatchesScope}
    >
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Batch Operations
          </h1>
        }
        center={<MarketingWorkspaceNav />}
        right={
          <RefreshCwTapButton
            ariaLabel="Refresh batch jobs"
            onClick={() => void batches.refetch()}
            disabled={batches.isFetching || isNavigating}
            className={batches.isFetching ? "animate-spin" : undefined}
          />
        }
      />
      <main className="h-full overflow-hidden bg-textured px-3 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        {batches.isError ? (
          <QueryError
            error={batches.error}
            onRetry={() => void batches.refetch()}
          />
        ) : (
          <MatrxDataTable<OperationsBatchRow>
            data={batches.data?.rows ?? []}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={batches.isLoading}
            isFetching={batches.isFetching || isNavigating}
            query={{
              mode: "controlled",
              state: table.state,
              totalItems: batches.data?.total ?? 0,
              onStateChange: table.onStateChange,
            }}
            toolbar={{
              searchPlaceholder: "Search external reference or error…",
              leading: (
                <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                  {isNavigating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  {(batches.data?.total ?? 0).toLocaleString()} accessible jobs
                </span>
              ),
            }}
            copy={{
              label: "Batch job",
              listLabel: "All batch jobs",
              location: webLocation("Batch operations"),
              rowKind: "web-batch-job",
              listKind: "web-batch-jobs-list",
              rowDescription:
                "One cross-site vision/LLM batch job execution record.",
              listDescription:
                "The currently loaded batch job rows (respecting search, filters, sort, and pagination).",
              humanRow: (row) =>
                humanLines([
                  ["Batch", row.id],
                  ["Site", row.site?.name ?? row.site_id],
                  ["Domain", row.site?.domain],
                  ["Status", row.status],
                  ["Kind", row.kind],
                  ["Provider", row.provider?.label ?? row.provider_id],
                  ["Created", formatCompactDate(row.created_at)],
                  ["Submitted", formatCompactDate(row.submitted_at)],
                  ["Completed", formatCompactDate(row.completed_at)],
                  ["External ref", row.external_ref],
                  ["Error", row.error],
                ]),
              rowAttributes: (row) => ({
                batch_id: row.id,
                site_id: row.site_id,
                status: row.status,
                kind: row.kind,
              }),
              listAttributes: () => ({
                total_matching: batches.data?.total ?? 0,
              }),
            }}
            detail={{ enabled: false }}
            onRowOpen={openBatch}
            emptyState={{
              icon: <Boxes className="h-8 w-8 text-muted-foreground" />,
              title: "No batch jobs",
              description:
                "Vision and LLM batch jobs will appear here when analysis work is queued.",
            }}
          />
        )}
      </main>
    </SurfaceRuntimeProvider>
  );
}
