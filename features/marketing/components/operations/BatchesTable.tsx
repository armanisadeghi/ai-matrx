"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Loader2 } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { RefreshCwTapButton } from "@/components/icons/tap-buttons";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  formatCompactDate,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { useBatches } from "@/features/marketing/data/operations-hooks";
import type { OperationsBatchRow } from "@/features/marketing/data/operations-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";

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
            className="font-mono text-[10px] text-primary hover:underline"
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

  return (
    <>
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Batch Operations
          </h1>
        }
        center={
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            {isNavigating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {(batches.data?.total ?? 0).toLocaleString()} accessible jobs
          </span>
        }
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
    </>
  );
}
