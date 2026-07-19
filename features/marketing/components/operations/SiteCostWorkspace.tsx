"use client";

import Link from "next/link";
import { CircleDollarSign } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { CostModeButtons } from "@/features/marketing/components/operations/CostModeButtons";
import {
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { formatRuntimeCost } from "@/features/marketing/data/operations-format";
import {
  useSiteCosts,
  useSiteCostTotal,
} from "@/features/marketing/data/operations-hooks";
import {
  siteCostMode,
  type SiteCostRow,
} from "@/features/marketing/data/operations-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";

const SITE_COST_MODES = [
  { value: "page", label: "By page" },
  { value: "run", label: "By run" },
  { value: "item", label: "By item" },
] as const;

export function SiteCostWorkspace() {
  const { site } = useMarketingSite();
  const table = useMarketingTableState({
    defaultSort: { id: "cost", direction: "desc" },
    defaultPageSize: 50,
  });
  const displayMode = siteCostMode(table.state.anyOf);
  const queryMode = siteCostMode(table.queryState.anyOf);
  const costs = useSiteCosts(site.id, queryMode, table.queryState);
  const total = useSiteCostTotal(site.id);
  const columns: MatrxColumnDef<SiteCostRow>[] = [
    {
      id: "mode",
      accessorKey: "mode",
      header: "Rollup",
      filter: false,
      sortable: false,
      cell: (row) => <StatusBadge value={row.mode} />,
    },
    {
      id: "label",
      accessorKey: "label",
      header: "Dimension",
      filter: false,
      sortable: false,
      cellKind: "text",
      cell: (row) => {
        if (row.page_id) {
          return (
            <Link
              href={`/marketing/sites/${site.id}/pages/${row.page_id}`}
              className="block min-w-72 max-w-3xl truncate font-mono text-xs text-primary hover:underline"
              title={row.label}
            >
              {row.label}
            </Link>
          );
        }
        if (row.batch_id) {
          return (
            <Link
              href={`/marketing/batches/${row.batch_id}`}
              className="block min-w-72 max-w-3xl truncate font-mono text-xs text-primary hover:underline"
              title={row.label}
            >
              {row.label}
            </Link>
          );
        }
        return (
          <span className="block min-w-72 max-w-3xl truncate font-mono text-xs">
            {row.label}
          </span>
        );
      },
    },
    {
      id: "run_id",
      accessorKey: "run_id",
      header: "Run",
      filter: false,
      sortable: false,
      cellKind: "uuid",
    },
    {
      id: "batch_id",
      accessorKey: "batch_id",
      header: "Batch",
      filter: false,
      sortable: false,
      cellKind: "uuid",
      fk: { href: (id) => `/marketing/batches/${id}` },
    },
    {
      id: "cost",
      accessorKey: "cost",
      header: "Cost (USD)",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-sm font-semibold tabular-nums">
          {formatRuntimeCost(row.cost)}
        </span>
      ),
    },
  ];

  const changeMode = (value: string) => {
    table.onStateChange({ ...table.state, page: 1, anyOf: value });
  };

  return (
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-textured p-3 sm:p-4">
      <section className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-foreground">Site cost</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            Runtime execution cost attributed through batch items.
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
            {total.isLoading ? "—" : formatRuntimeCost(total.data)}
          </p>
          <p className="text-[10px] uppercase text-muted-foreground">
            All attributed cost
          </p>
        </div>
      </section>
      <div className="min-h-0 flex-1">
        {costs.isError || total.isError ? (
          <QueryError
            error={costs.error ?? total.error}
            onRetry={() => {
              void costs.refetch();
              void total.refetch();
            }}
          />
        ) : (
          <MatrxDataTable<SiteCostRow>
            data={costs.data?.rows ?? []}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={costs.isLoading}
            isFetching={costs.isFetching}
            query={{
              mode: "controlled",
              state: table.state,
              totalItems: costs.data?.total ?? 0,
              onStateChange: table.onStateChange,
            }}
            toolbar={{
              search: false,
              leading: (
                <CostModeButtons
                  value={displayMode}
                  options={SITE_COST_MODES}
                  onChange={changeMode}
                />
              ),
            }}
            detail={{
              title: (row) => row.label,
              description: (row) =>
                `${row.mode} rollup · ${formatRuntimeCost(row.cost)}`,
            }}
            emptyState={{
              icon: (
                <CircleDollarSign className="h-8 w-8 text-muted-foreground" />
              ),
              title: "No attributed cost",
              description:
                "Cost appears after runtime executions are linked to web batch items.",
            }}
          />
        )}
      </div>
    </main>
  );
}
