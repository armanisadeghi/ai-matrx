"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

import { AdminAuditTable, type AuditColumnDef } from "./AdminAuditTable";
import { CanonicalizationToolbar } from "./CanonicalizationToolbar";
import { useAuditDataset } from "../hooks/useAuditDataset";
import { useCanonicalizationDatasetToolbar } from "../hooks/useCanonicalizationDatasetToolbar";
import {
  isAuditSummaryRow,
  type AuditSchemaSummaryRow,
  type AuditSummaryRow,
} from "../types";
import { SCHEMA_SUMMARY_TABLE_COPY } from "../utils/aiExport";

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

const COLUMNS: AuditColumnDef<AuditSchemaSummaryRow>[] = [
  {
    key: "schema_name",
    label: "Schema",
    type: "text",
    getValue: (r) => r.schema_name,
    width: "minmax(160px,1fr)",
    copyable: true,
  },
  {
    key: "fails",
    label: "Fails",
    type: "number",
    getValue: (r) => r.fails,
    width: "90px",
    align: "right",
  },
  {
    key: "warns",
    label: "Warns",
    type: "number",
    getValue: (r) => r.warns,
    width: "90px",
    align: "right",
  },
  {
    key: "tables",
    label: "Tables",
    type: "number",
    getValue: (r) => r.tables,
    width: "90px",
    align: "right",
  },
  {
    key: "failing_tables",
    label: "Tables failing",
    type: "number",
    getValue: (r) => r.failing_tables,
    width: "120px",
    align: "right",
  },
  {
    key: "certified",
    label: "Certified",
    type: "number",
    getValue: (r) => r.certified,
    width: "100px",
    align: "right",
  },
  {
    key: "uncertified",
    label: "Not certified",
    type: "number",
    getValue: (r) => r.uncertified,
    width: "120px",
    align: "right",
  },
  {
    key: "machinery",
    label: "Machinery",
    type: "number",
    getValue: (r) => r.machinery,
    width: "110px",
    align: "right",
  },
  {
    key: "certified_pct",
    label: "% certified",
    type: "number",
    getValue: (r) => certifiedPct(r),
    width: "110px",
    align: "right",
    render: (r) => {
      const pct = certifiedPct(r);
      if (pct === null) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <div className="flex w-full items-center justify-end gap-2">
          <div className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="tabular-nums">{pct}%</span>
        </div>
      );
    },
  },
];

export function SchemaSummaryPage() {
  const router = useRouter();
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
        <AdminAuditTable
          rows={schemaRows}
          columns={COLUMNS}
          loading={loading}
          error={error}
          csvFilename="canonicalization-summary-by-schema.csv"
          defaultSort={{ key: "fails", dir: "desc" }}
          emptyMessage="No registered tables found."
          copyForAi={SCHEMA_SUMMARY_TABLE_COPY}
          onRowClick={(row) =>
            router.push(
              `/administration/database/canonicalization/summary?schema=${encodeURIComponent(row.schema_name)}`,
            )
          }
        />
      </div>
    </div>
  );
}
