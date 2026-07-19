"use client";

import Link from "next/link";
import { FileClock } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import {
  ChevronLeftTapButton,
  RefreshCwTapButton,
} from "@/components/icons/tap-buttons";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  formatCompactDate,
  JsonPreview,
  LoadingSurface,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { formatRuntimeCost } from "@/features/marketing/data/operations-format";
import {
  useBatch,
  useBatchItems,
} from "@/features/marketing/data/operations-hooks";
import type { OperationsBatchItemRow } from "@/features/marketing/data/operations-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";

const ITEM_STATUS_OPTIONS = [
  { value: "queued", label: "Queued" },
  { value: "submitted", label: "Submitted" },
  { value: "processing", label: "Processing" },
  { value: "complete", label: "Complete" },
  { value: "failed", label: "Failed" },
];

const SUBJECT_TYPE_OPTIONS = [
  { value: "site", label: "Site" },
  { value: "page", label: "Page" },
  { value: "snapshot", label: "Snapshot" },
];

function HeaderDatum({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 border-r border-border/70 px-3 py-2 last:border-r-0">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 truncate text-xs text-foreground">{children}</div>
    </div>
  );
}

export function BatchDetailWorkspace({ batchId }: { batchId: string }) {
  const table = useMarketingTableState({
    defaultSort: { id: "created_at", direction: "asc" },
    defaultPageSize: 50,
  });
  const batch = useBatch(batchId);
  const items = useBatchItems(
    batch.data?.site_id ?? "",
    batchId,
    table.queryState,
  );
  const columns: MatrxColumnDef<OperationsBatchItemRow>[] = [
    {
      id: "item",
      header: "Analysis item",
      filter: false,
      sortable: false,
      cell: (row) => (
        <div className="min-w-44 max-w-72">
          <p className="truncate text-xs font-medium">
            {row.item?.label ?? row.item_id}
          </p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {row.item?.category && row.item?.subcategory
              ? `${row.item.category} / ${row.item.subcategory} / ${row.item.key}`
              : row.item?.key ?? "Catalog item"}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      filterOptions: ITEM_STATUS_OPTIONS,
      cell: (row) => <StatusBadge value={row.status} />,
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
      id: "subject_id",
      accessorKey: "subject_id",
      header: "Subject ID",
      filter: false,
      sortable: false,
      cellKind: "uuid",
      fk: {
        href: (id, row) =>
          row.subject_type === "page" && batch.data
            ? `/marketing/sites/${batch.data.site_id}/pages/${id}`
            : null,
      },
    },
    {
      id: "provider",
      header: "Provider",
      filter: false,
      sortable: false,
      cell: (row) => (
        <div className="min-w-32 max-w-48">
          <p className="truncate text-xs">{row.provider?.label ?? "—"}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {row.provider?.key ?? row.provider_id}
          </p>
        </div>
      ),
    },
    {
      id: "cost",
      accessorKey: "cost",
      header: "Cost",
      filter: false,
      sortable: false,
      align: "right",
      cell: (row) => (
        <span className="font-mono text-xs font-semibold tabular-nums">
          {formatRuntimeCost(row.cost)}
        </span>
      ),
    },
    {
      id: "result_id",
      accessorKey: "result_id",
      header: "Result",
      filter: false,
      sortable: false,
      cellKind: "uuid",
    },
    {
      id: "external_ref",
      accessorKey: "external_ref",
      header: "External ref",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block max-w-48 truncate font-mono text-[11px]">
          {row.external_ref || "—"}
        </span>
      ),
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: "Created",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.created_at)}
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

  if (batch.isLoading) {
    return (
      <>
        <RouteHeader
          left={
            <ChevronLeftTapButton
              href="/marketing/batches"
              ariaLabel="All batch jobs"
            />
          }
        />
        <div className="h-full pt-[var(--shell-header-h)]">
          <LoadingSurface label="Loading batch…" />
        </div>
      </>
    );
  }
  if (batch.isError || !batch.data) {
    return (
      <>
        <RouteHeader
          left={
            <ChevronLeftTapButton
              href="/marketing/batches"
              ariaLabel="All batch jobs"
            />
          }
        />
        <div className="h-full pt-[var(--shell-header-h)]">
          <QueryError
            error={batch.error ?? new Error("Batch not found")}
            onRetry={() => void batch.refetch()}
          />
        </div>
      </>
    );
  }

  const job = batch.data;
  return (
    <>
      <RouteHeader
        left={
          <div className="flex min-w-0 items-center gap-1">
            <ChevronLeftTapButton
              href="/marketing/batches"
              ariaLabel="All batch jobs"
            />
            <h1 className="truncate text-sm font-medium text-foreground">
              Batch {job.id.slice(0, 12)}
            </h1>
          </div>
        }
        center={<StatusBadge value={job.status} />}
        right={
          <RefreshCwTapButton
            ariaLabel="Refresh batch"
            onClick={() => {
              void batch.refetch();
              void items.refetch();
            }}
            disabled={batch.isFetching || items.isFetching}
            className={
              batch.isFetching || items.isFetching ? "animate-spin" : undefined
            }
          />
        }
      />
      <main className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-textured px-3 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        <section className="grid shrink-0 grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4 lg:grid-cols-7">
          <HeaderDatum label="Site">
            <Link
              href={`/marketing/sites/${job.site_id}`}
              className="hover:text-primary hover:underline"
            >
              {job.site?.name ?? job.site_id}
            </Link>
          </HeaderDatum>
          <HeaderDatum label="Kind">
            <span className="uppercase">{job.kind}</span>
          </HeaderDatum>
          <HeaderDatum label="Provider">
            {job.provider?.label ?? job.provider_id}
          </HeaderDatum>
          <HeaderDatum label="Created">
            {formatCompactDate(job.created_at)}
          </HeaderDatum>
          <HeaderDatum label="Submitted">
            {formatCompactDate(job.submitted_at)}
          </HeaderDatum>
          <HeaderDatum label="Completed">
            {formatCompactDate(job.completed_at)}
          </HeaderDatum>
          <HeaderDatum label="Items">
            {(items.data?.total ?? 0).toLocaleString()}
          </HeaderDatum>
        </section>
        {job.error ? (
          <div className="shrink-0 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {job.error}
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          {items.isError ? (
            <QueryError
              error={items.error}
              onRetry={() => void items.refetch()}
            />
          ) : (
            <MatrxDataTable<OperationsBatchItemRow>
              data={items.data?.rows ?? []}
              columns={columns}
              getRowId={(row) => row.id}
              isLoading={items.isLoading}
              isFetching={items.isFetching}
              query={{
                mode: "controlled",
                state: table.state,
                totalItems: items.data?.total ?? 0,
                onStateChange: table.onStateChange,
              }}
              toolbar={{
                searchPlaceholder: "Search external reference or error…",
              }}
              detail={{
                title: (row) => row.item?.label ?? row.item_id,
                description: (row) =>
                  `${row.subject_type} · ${row.status} · ${formatRuntimeCost(row.cost)}`,
                render: (row) => (
                  <div className="grid gap-3 p-3">
                    <div className="rounded-md border border-border px-3 py-2 text-xs">
                      <p className="font-medium">{row.item?.label ?? row.item_id}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {row.subject_type} / {row.subject_id}
                      </p>
                    </div>
                    <JsonPreview value={row.metadata} />
                  </div>
                ),
              }}
              emptyState={{
                icon: <FileClock className="h-8 w-8 text-muted-foreground" />,
                title: "No batch items",
                description:
                  "Execution units will appear here after this batch is populated.",
              }}
            />
          )}
        </div>
      </main>
    </>
  );
}
