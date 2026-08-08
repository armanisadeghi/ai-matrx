"use client";

import Link from "next/link";
import { CircleDollarSign } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { AgentCopyGroomerLauncher } from "@/components/agent-copy/AgentCopyGroomerLauncher";
import {
  groomerPresetVariants,
  type AgentCopyGroomerConfig,
  type AgentCopyGroomerSection,
} from "@/components/agent-copy/groomer-types";
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
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";

const SITE_COST_MODES = [
  { value: "page", label: "By page" },
  { value: "run", label: "By run" },
  { value: "item", label: "By item" },
] as const;

export function SiteCostWorkspace() {
  const { site, sitePath } = useMarketingSite();
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
              href={`${sitePath}/pages/${row.page_id}`}
              className="block min-w-72 max-w-3xl truncate font-mono text-xs text-primary"
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
              className="block min-w-72 max-w-3xl truncate font-mono text-xs text-primary"
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

  const pageLocation = webLocation(`Site cost — ${site.root_url}`);
  const rows = costs.data?.rows ?? [];
  const pageHuman = () =>
    humanLines([
      ["Site", site.root_url],
      ["Rollup mode", displayMode],
      ["Loaded rollup rows", rows.length],
      ["Total matching", costs.data?.total ?? 0],
      ["All attributed cost", formatRuntimeCost(total.data)],
    ]);
  const groomerSections = (): AgentCopyGroomerSection[] => [
    {
      id: "total",
      title: "All attributed cost",
      description: "The site's total runtime execution cost across every rollup.",
      build: () => ({ total_cost_usd: total.data ?? null }),
    },
    {
      id: "rollups",
      title: `Cost rollups (${displayMode})`,
      description: `${rows.length} loaded of ${costs.data?.total ?? 0} recorded (current rollup mode + filters).`,
      cuttable: true,
      levelLabels: {
        full: `Loaded ${rows.length} (raw)`,
        compact: "Top 25 (key fields)",
        brief: "Counts only",
      },
      build: (level) =>
        level === "full"
          ? { rollup_mode: displayMode, query: table.state, rows }
          : level === "compact"
            ? {
                rollup_mode: displayMode,
                rows: rows.slice(0, 25).map((row) => ({
                  mode: row.mode,
                  label: row.label,
                  cost: row.cost,
                })),
              }
            : {
                rollup_mode: displayMode,
                total_matching: costs.data?.total ?? 0,
                loaded_rows: rows.length,
              },
    },
  ];
  const groomerConfig = (): AgentCopyGroomerConfig => ({
    label: `Site cost — ${site.root_url}`,
    kind: "marketing-site-cost-page",
    location: pageLocation,
    description: `Runtime execution cost attributed to ${site.root_url}.`,
    attributes: { site_id: site.id, domain: site.root_url },
    summary: pageHuman(),
    sections: groomerSections(),
  });
  const pageFullData = (): Record<string, unknown> => {
    const full: Record<string, unknown> = {};
    for (const section of groomerSections()) {
      const value = section.build("full");
      if (value !== null && value !== undefined) full[section.id] = value;
    }
    return full;
  };

  return (
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-textured p-3 sm:p-4">
      <section className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            Site cost
            <span className="text-xs font-normal tabular-nums text-muted-foreground">
              {(costs.data?.total ?? 0).toLocaleString()}
            </span>
          </h1>
          <p className="truncate text-[11px] text-muted-foreground">
            Runtime execution cost attributed through batch items.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="group/metric relative text-right">
            <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
              {total.isLoading ? "—" : formatRuntimeCost(total.data)}
            </p>
            <p className="text-[10px] uppercase text-muted-foreground">
              All attributed cost
            </p>
            <span className="absolute -left-6 top-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/metric:opacity-100">
              <CopyButtons
                size="xs"
                label="All attributed cost"
                human={() =>
                  `All attributed cost for ${site.root_url}: ${formatRuntimeCost(total.data)}`
                }
                agent={() => ({
                  kind: "web-site-cost-total",
                  location: pageLocation,
                  description: "The site's total attributed runtime execution cost.",
                  data: { total_cost_usd: total.data ?? null },
                  attributes: { site_id: site.id },
                })}
              />
            </span>
          </div>
          <CopyButtons
            size="icon"
            label={`Site cost page (${site.root_url})`}
            human={pageHuman}
            json={pageFullData}
            agent={() => ({
              kind: "marketing-site-cost-page",
              location: pageLocation,
              description: `Runtime execution cost attributed to ${site.root_url}.`,
              data: pageFullData(),
              summary: pageHuman(),
              attributes: { site_id: site.id, domain: site.root_url },
            })}
            aiVariants={groomerPresetVariants(groomerConfig)}
          />
          <AgentCopyGroomerLauncher config={groomerConfig} />
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
            copy={{
              label: "Cost rollup",
              listLabel: "All site cost rollups",
              location: webLocation(`Site cost — ${site.root_url}`),
              rowKind: "web-cost-rollup",
              listKind: "web-site-cost-rollups",
              rowDescription:
                "One runtime cost rollup row for this site (by page, run, or item).",
              listDescription:
                "The currently loaded site cost rollup rows (respecting the rollup mode, filters, sort, and pagination).",
              humanRow: (row) =>
                humanLines([
                  ["Rollup", row.mode],
                  ["Dimension", row.label],
                  ["Run", row.run_id],
                  ["Batch", row.batch_id],
                  ["Cost (USD)", formatRuntimeCost(row.cost)],
                ]),
              rowAttributes: (row) => ({
                site_id: site.id,
                mode: row.mode,
                page_id: row.page_id,
                run_id: row.run_id,
                batch_id: row.batch_id,
              }),
              listAttributes: () => ({
                site_id: site.id,
                rollup_mode: displayMode,
                total_matching: costs.data?.total ?? 0,
                site_total_cost: formatRuntimeCost(total.data),
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
