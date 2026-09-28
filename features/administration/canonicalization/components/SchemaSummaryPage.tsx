"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Copy } from "lucide-react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { toast } from "@/lib/toast";

import { CanonicalizationToolbar } from "./CanonicalizationToolbar";
import { readOf } from "@/components/read-state/ReadGate";
import { useAuditDataset } from "../hooks/useAuditDataset";
import { useCanonicalizationDatasetToolbar } from "../hooks/useCanonicalizationDatasetToolbar";
import {
  isAuditSummaryRow,
  isStaleRegistryRow,
  isUnregisteredCandidateRow,
  type AuditSchemaSummaryRow,
  type AuditSummaryRow,
  type StaleRegistryRow,
  type UnregisteredCandidateRow,
} from "../types";
import { SCHEMA_SUMMARY_TABLE_COPY } from "../utils/aiExport";
import { exportRowsAsCsv } from "../utils/exportCsv";

/**
 * Rolls the per-table `audit.summary` rows up to one row per schema, and adds
 * what the summary cannot see: tables with no registry row at all and registry
 * rows whose table is gone. A schema that has ONLY those still gets a row —
 * a problem the report hides is a problem nobody fixes.
 */
function rollUpBySchema(
  rows: AuditSummaryRow[],
  unregistered: UnregisteredCandidateRow[],
  deadRegistry: StaleRegistryRow[],
): AuditSchemaSummaryRow[] {
  const bySchema = new Map<string, AuditSchemaSummaryRow>();
  const aggFor = (schema: string): AuditSchemaSummaryRow => {
    let agg = bySchema.get(schema);
    if (!agg) {
      agg = {
        schema_name: schema,
        tables: 0,
        certified: 0,
        uncertified: 0,
        machinery: 0,
        machinery_failing: 0,
        failing_tables: 0,
        fails: 0,
        warns: 0,
        unregistered: 0,
        dead_registry: 0,
        problems: 0,
      };
      bySchema.set(schema, agg);
    }
    return agg;
  };
  for (const r of rows) {
    const agg = aggFor(r.schema_name);
    agg.tables += 1;
    if (r.audit_class === "machinery") {
      agg.machinery += 1;
      if (r.fails > 0) agg.machinery_failing += 1;
    } else if (r.certified) agg.certified += 1;
    else agg.uncertified += 1;
    if (r.fails > 0) agg.failing_tables += 1;
    agg.fails += r.fails;
    agg.warns += r.warns;
  }
  for (const u of unregistered) {
    if (u.schema_name) aggFor(u.schema_name).unregistered += 1;
  }
  for (const d of deadRegistry) {
    if (d.schema_name) aggFor(d.schema_name).dead_registry += 1;
  }
  for (const agg of bySchema.values()) {
    agg.problems = agg.fails + agg.warns + agg.unregistered + agg.dead_registry;
  }
  return [...bySchema.values()];
}

function certifiedPct(r: AuditSchemaSummaryRow): number | null {
  const scored = r.certified + r.uncertified;
  return scored === 0 ? null : Math.round((r.certified / scored) * 100);
}

type SchemaTotalField = Exclude<keyof AuditSchemaSummaryRow, "schema_name">;

function schemaTotal(rows: readonly AuditSchemaSummaryRow[], field: SchemaTotalField): number {
  return rows.reduce((total, row) => total + row[field], 0);
}

function schemaCertificationRate(rows: readonly AuditSchemaSummaryRow[]): string {
  const certified = schemaTotal(rows, "certified");
  const scored = certified + schemaTotal(rows, "uncertified");
  return scored === 0 ? "—" : `${Math.round((certified / scored) * 100)}%`;
}

const schemaHref = (row: AuditSchemaSummaryRow) =>
  `/administration/database/canonicalization/summary?schema=${encodeURIComponent(row.schema_name)}`;

const COLUMNS: MatrxColumnDef<AuditSchemaSummaryRow>[] = [
  {
    id: "schema_name",
    header: "Schema",
    label: "Schema",
    accessorFn: (r) => r.schema_name,
    filter: "text",
    width: 200,
    cell: (row) => (
      <div className="flex min-w-0 items-center gap-1">
        <Link
          href={schemaHref(row)}
          onClick={(event) => event.stopPropagation()}
          className="min-w-0 truncate text-primary hover:underline"
          title={row.schema_name}
        >
          {row.schema_name}
        </Link>
        <button
          type="button"
          aria-label={`Copy ${row.schema_name}`}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            void navigator.clipboard
              .writeText(row.schema_name)
              .then(() => toast.success("Copied to clipboard"))
              .catch(() => toast.error("Could not copy schema name"));
          }}
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>
    ),
  },
  {
    id: "problems",
    header: "Problems",
    accessorFn: (r) => r.problems,
    filter: "number",
    width: 100,
    align: "right",
  },
  {
    id: "fails",
    header: "Fails",
    accessorFn: (r) => r.fails,
    filter: "number",
    width: 90,
    align: "right",
  },
  {
    id: "warns",
    header: "Warns",
    accessorFn: (r) => r.warns,
    filter: "number",
    width: 90,
    align: "right",
  },
  {
    id: "tables",
    header: "Tables",
    accessorFn: (r) => r.tables,
    filter: "number",
    width: 90,
    align: "right",
  },
  {
    id: "failing_tables",
    header: "Tables failing",
    accessorFn: (r) => r.failing_tables,
    filter: "number",
    width: 120,
    align: "right",
  },
  {
    id: "certified",
    header: "Certified",
    accessorFn: (r) => r.certified,
    filter: "number",
    width: 100,
    align: "right",
  },
  {
    id: "uncertified",
    header: "Not certified",
    accessorFn: (r) => r.uncertified,
    filter: "number",
    width: 120,
    align: "right",
  },
  {
    id: "machinery",
    header: "Machinery",
    accessorFn: (r) => r.machinery,
    filter: "number",
    width: 110,
    align: "right",
  },
  {
    id: "machinery_failing",
    header: "Machinery failing",
    accessorFn: (r) => r.machinery_failing,
    filter: "number",
    width: 140,
    align: "right",
  },
  {
    id: "unregistered",
    header: "Unregistered",
    accessorFn: (r) => r.unregistered,
    filter: "number",
    width: 120,
    align: "right",
  },
  {
    id: "dead_registry",
    header: "Dead registry rows",
    accessorFn: (r) => r.dead_registry,
    filter: "number",
    width: 150,
    align: "right",
  },
  {
    id: "certified_pct",
    header: "% certified",
    accessorFn: (r) => certifiedPct(r),
    filter: "number",
    width: 130,
    align: "right",
    cell: (r) => {
      const pct = certifiedPct(r);
      if (pct === null) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <div className="flex w-full items-center justify-end gap-2">
          <div className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <span className="tabular-nums">{pct}%</span>
        </div>
      );
    },
  },
];

export function SchemaSummaryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacySort = searchParams.get("sort");
  const initialSort = COLUMNS.some((column) => column.id === legacySort)
    ? {
        id: legacySort ?? "fails",
        direction:
          searchParams.get("dir") === "asc"
            ? ("asc" as const)
            : ("desc" as const),
      }
    : { id: "problems", direction: "desc" as const };
  const summary = useAuditDataset<AuditSummaryRow>("summary", isAuditSummaryRow);
  const unregistered = useAuditDataset<UnregisteredCandidateRow>(
    "unregistered-candidates",
    isUnregisteredCandidateRow,
  );
  const deadRegistry = useAuditDataset<StaleRegistryRow>(
    "stale-registry",
    isStaleRegistryRow,
  );
  const loading = summary.loading || unregistered.loading || deadRegistry.loading;
  const error = summary.error ?? unregistered.error ?? deadRegistry.error;
  const reload = async () => {
    await Promise.all([summary.reload(), unregistered.reload(), deadRegistry.reload()]);
  };
  const toolbar = useCanonicalizationDatasetToolbar(reload);
  const schemaRows = rollUpBySchema(summary.rows, unregistered.rows, deadRegistry.rows);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <CanonicalizationToolbar
        onReload={reload}
        reloading={loading}
        onRefreshAudit={toolbar.onRefreshAudit}
        refreshingAudit={toolbar.refreshingAudit}
        lastRefreshedAt={toolbar.lastRefreshedAt}
      />
      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
        <MatrxDataTable<AuditSchemaSummaryRow>
          data={schemaRows}
          columns={COLUMNS}
          summary={{
            metrics: [
              { id: "problems", label: "Problems", value: ({ rows: visible }) => schemaTotal(visible, "problems") },
              { id: "schemas", label: "Schemas", value: ({ rows: visible }) => visible.length },
              { id: "tables", label: "Tables", value: ({ rows: visible }) => schemaTotal(visible, "tables") },
              { id: "certified", label: "Certified", value: ({ rows: visible }) => schemaTotal(visible, "certified") },
              { id: "uncertified", label: "Not certified", value: ({ rows: visible }) => schemaTotal(visible, "uncertified") },
              { id: "machinery", label: "Machinery", value: ({ rows: visible }) => schemaTotal(visible, "machinery") },
              { id: "machinery_failing", label: "Machinery failing", value: ({ rows: visible }) => schemaTotal(visible, "machinery_failing") },
              { id: "unregistered", label: "Unregistered", value: ({ rows: visible }) => schemaTotal(visible, "unregistered") },
              { id: "dead_registry", label: "Dead registry rows", value: ({ rows: visible }) => schemaTotal(visible, "dead_registry") },
              { id: "fails", label: "Fails", value: ({ rows: visible }) => schemaTotal(visible, "fails") },
              { id: "warns", label: "Warnings", value: ({ rows: visible }) => schemaTotal(visible, "warns") },
              { id: "certification-rate", label: "Certification rate", value: ({ rows: visible }) => schemaCertificationRate(visible) },
            ],
            totals: {
              problems: ({ rows: visible }) => schemaTotal(visible, "problems"),
              machinery_failing: ({ rows: visible }) => schemaTotal(visible, "machinery_failing"),
              unregistered: ({ rows: visible }) => schemaTotal(visible, "unregistered"),
              dead_registry: ({ rows: visible }) => schemaTotal(visible, "dead_registry"),
              fails: ({ rows: visible }) => schemaTotal(visible, "fails"),
              warns: ({ rows: visible }) => schemaTotal(visible, "warns"),
              tables: ({ rows: visible }) => schemaTotal(visible, "tables"),
              failing_tables: ({ rows: visible }) => schemaTotal(visible, "failing_tables"),
              certified: ({ rows: visible }) => schemaTotal(visible, "certified"),
              uncertified: ({ rows: visible }) => schemaTotal(visible, "uncertified"),
              machinery: ({ rows: visible }) => schemaTotal(visible, "machinery"),
              certified_pct: ({ rows: visible }) => schemaCertificationRate(visible),
            },
          }}
          getRowId={(row) => row.schema_name}
          isLoading={loading}
          read={readOf(
            { loading, error },
            { what: "the schema summary", onRetry: reload },
          )}
          emptyState={{ title: "No registered tables found" }}
          pageSize={0}
          virtualize={{
            enabled: true,
            rowHeight: 34,
            overscan: 12,
            threshold: 1,
          }}
          urlState={{
            id: "canonicalization-by-schema",
            defaultSort: initialSort,
          }}
          toolbar={{ search: true, searchPlaceholder: "Search all columns…" }}
          coverage={{
            loaded: schemaRows.length,
            total: schemaRows.length,
            answeredBy: "source",
            noun: "schema",
          }}
          facets={{ enabled: true, totalRows: schemaRows.length }}
          getRowHref={schemaHref}
          onRowOpen={(row) => router.push(schemaHref(row))}
          detail={{ enabled: false }}
          copy={{
            ...SCHEMA_SUMMARY_TABLE_COPY,
            listHuman: (visible) =>
              visible.map(SCHEMA_SUMMARY_TABLE_COPY.humanRow).join("\n\n"),
            export: (visible) => ({
              items: [
                {
                  id: "schema-summary-csv",
                  label: "Export CSV",
                  onSelect: () =>
                    exportRowsAsCsv(
                      "canonicalization-summary-by-schema.csv",
                      visible,
                      COLUMNS.map((column) => ({
                        key: column.id ?? "",
                        label: String(column.header),
                        getValue: (row: AuditSchemaSummaryRow) =>
                          column.accessorFn?.(row),
                      })),
                    ),
                },
              ],
            }),
          }}
        />
      </div>
    </div>
  );
}
