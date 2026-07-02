"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AdminAuditTable, type AuditColumnDef } from "./AdminAuditTable";
import { CanonicalizationToolbar } from "./CanonicalizationToolbar";
import { BoolBadge } from "./StatusBadge";
import { useAuditDataset } from "../hooks/useAuditDataset";
import { isAuditSummaryRow, type AuditSummaryRow } from "../types";
import type { ColumnFilter } from "@/features/administration/kg-inspector/utils/tableFilters";

export function SummaryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { rows, loading, reload } = useAuditDataset<AuditSummaryRow>("summary", isAuditSummaryRow);

  const onlyUncertified = searchParams.get("onlyUncertified") === "1";
  const initialColumnFilters = useMemo<Record<string, ColumnFilter> | undefined>(
    () => (onlyUncertified ? { certified: { enumValues: ["false"] } } : undefined),
    [onlyUncertified],
  );

  const columns: AuditColumnDef<AuditSummaryRow>[] = useMemo(
    () => [
      { key: "schema_name", label: "Schema", type: "text", getValue: (r) => r.schema_name, width: "140px" },
      {
        key: "table_name",
        label: "Table",
        type: "text",
        getValue: (r) => r.table_name,
        width: "220px",
        copyable: true,
      },
      {
        key: "token",
        label: "Token",
        type: "text",
        getValue: (r) => r.token,
        width: "200px",
        monospace: true,
        copyable: true,
      },
      { key: "fails", label: "Fails", type: "number", getValue: (r) => r.fails, width: "90px", align: "right" },
      { key: "warns", label: "Warns", type: "number", getValue: (r) => r.warns, width: "90px", align: "right" },
      {
        key: "certified",
        label: "Certified",
        type: "enum",
        getValue: (r) => String(r.certified),
        width: "130px",
        render: (r) => <BoolBadge value={r.certified} trueLabel="Certified" falseLabel="Not certified" />,
      },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <CanonicalizationToolbar onReload={reload} reloading={loading} />
      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
        <AdminAuditTable
          rows={rows}
          columns={columns}
          loading={loading}
          csvFilename="canonicalization-summary.csv"
          defaultSort={{ key: "fails", dir: "desc" }}
          initialColumnFilters={initialColumnFilters}
          emptyMessage="No registered tables found."
          onRowClick={(row) =>
            router.push(
              `/administration/canonicalization/verify?schema=${encodeURIComponent(row.schema_name)}&table=${encodeURIComponent(row.table_name)}&token=${encodeURIComponent(row.token)}`,
            )
          }
        />
      </div>
    </div>
  );
}
