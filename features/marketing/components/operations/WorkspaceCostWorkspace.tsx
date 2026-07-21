"use client";

import Link from "next/link";
import { CircleDollarSign } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { RefreshCwTapButton } from "@/components/icons/tap-buttons";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { CostModeButtons } from "@/features/marketing/components/operations/CostModeButtons";
import {
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";
import { formatRuntimeCost } from "@/features/marketing/data/operations-format";
import { useWorkspaceCosts } from "@/features/marketing/data/operations-hooks";
import {
  workspaceCostMode,
  type WorkspaceCostRow,
} from "@/features/marketing/data/operations-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";

const WORKSPACE_COST_MODES = [
  { value: "site", label: "By site" },
  { value: "client", label: "By client" },
] as const;

export function WorkspaceCostWorkspace() {
  const table = useMarketingTableState({
    defaultSort: { id: "cost", direction: "desc" },
    defaultPageSize: 50,
  });
  const displayMode = workspaceCostMode(table.state.anyOf);
  const queryMode = workspaceCostMode(table.queryState.anyOf);
  const costs = useWorkspaceCosts(queryMode, table.queryState);
  const columns: MatrxColumnDef<WorkspaceCostRow>[] = [
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
      header: "Site / client",
      filter: false,
      sortable: false,
      cellKind: "text",
      cell: (row) =>
        row.site_id ? (
          <Link
            href={`/marketing/sites/${row.site_id}`}
            className="block min-w-64 max-w-2xl hover:text-primary"
          >
            <span className="block truncate text-xs font-medium">
              {row.label}
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {row.detail ?? row.site_id}
            </span>
          </Link>
        ) : (
          <span className="block min-w-64 max-w-2xl truncate font-mono text-xs">
            {row.label}
          </span>
        ),
    },
    {
      id: "client_org_id",
      accessorKey: "client_org_id",
      header: "Client organization",
      filter: false,
      sortable: false,
      cellKind: "uuid",
    },
    {
      id: "site_id",
      accessorKey: "site_id",
      header: "Site ID",
      filter: false,
      sortable: false,
      cellKind: "uuid",
      fk: { href: (id) => `/marketing/sites/${id}` },
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
    <>
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Marketing Cost
          </h1>
        }
        center={<MarketingWorkspaceNav />}
        right={
          <RefreshCwTapButton
            ariaLabel="Refresh cost rollups"
            onClick={() => void costs.refetch()}
            disabled={costs.isFetching}
            className={costs.isFetching ? "animate-spin" : undefined}
          />
        }
      />
      <main className="h-full overflow-hidden bg-textured px-3 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        {costs.isError ? (
          <QueryError
            error={costs.error}
            onRetry={() => void costs.refetch()}
          />
        ) : (
          <MatrxDataTable<WorkspaceCostRow>
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
                <div className="flex items-center gap-2">
                  <CostModeButtons
                    value={displayMode}
                    options={WORKSPACE_COST_MODES}
                    onChange={changeMode}
                  />
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {(costs.data?.total ?? 0).toLocaleString()} rollups
                  </span>
                </div>
              ),
            }}
            copy={{
              label: "Cost rollup",
              listLabel: "All workspace cost rollups",
              location: webLocation("Workspace cost"),
              rowKind: "web-cost-rollup",
              listKind: "web-workspace-cost-rollups",
              rowDescription:
                "One workspace runtime cost rollup row (by site or client organization).",
              listDescription:
                "The currently loaded workspace cost rollup rows (respecting the rollup mode, filters, sort, and pagination).",
              humanRow: (row) =>
                humanLines([
                  ["Rollup", row.mode],
                  ["Label", row.label],
                  ["Detail", row.detail],
                  ["Site", row.site_id],
                  ["Client organization", row.client_org_id],
                  ["Cost (USD)", formatRuntimeCost(row.cost)],
                ]),
              rowAttributes: (row) => ({
                mode: row.mode,
                site_id: row.site_id,
                client_org_id: row.client_org_id,
              }),
              listAttributes: () => ({
                rollup_mode: displayMode,
                total_matching: costs.data?.total ?? 0,
              }),
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
              title: "No workspace cost",
              description:
                "Cost rollups populate when runtime executions are linked to web batch items.",
            }}
          />
        )}
      </main>
    </>
  );
}
