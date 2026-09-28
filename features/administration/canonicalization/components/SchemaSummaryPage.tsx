"use client";

import { useMemo } from "react";
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
  type AuditSchemaSummaryRow,
  type AuditSummaryRow,
} from "../types";
import { SCHEMA_SUMMARY_TABLE_COPY } from "../utils/aiExport";
import { exportRowsAsCsv } from "../utils/exportCsv";

/** Rolls the per-table `audit.summary` rows up to one row per schema. */
function rollUpBySchema(rows: AuditSummaryRow[]): AuditSchemaSummaryRow[] {
  const bySchema = new Map<string, AuditSchemaSummaryRow>();
  for (const r of rows) {
    let agg = bySchema.get(r.schema_name);
    if (!agg) {
      agg = {
        schema_name: r.schema_name,
        tables: 0,
        certified: 0,
        uncertified: 0,
        machinery: 0,
        failing_tables: 0,
        fails: 0,
        warns: 0,
      };
      bySchema.set(r.schema_name, agg);
    }
    agg.tables += 1;
    if (r.audit_class === "machinery") agg.machinery += 1;
    else if (r.certified) agg.certified += 1;
    else agg.uncertified += 1;
    if (r.fails > 0) agg.failing_tables += 1;
    agg.fails += r.fails;
    agg.warns += r.warns;
  }
  return [...bySchema.values()];
}

function certifiedPct(r: AuditSchemaSummaryRow): number | null {
  const scored = r.certified + r.uncertified;
  return scored === 0 ? null : Math.round((r.certified / scored) * 100);
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
    : { id: "fails", direction: "desc" as const };
  const { rows, loading, error, reload } = useAuditDataset<AuditSummaryRow>(
    "summary",
    isAuditSummaryRow,
  );
  const toolbar = useCanonicalizationDatasetToolbar(reload);
  const schemaRows = useMemo(() => rollUpBySchema(rows), [rows]);

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
