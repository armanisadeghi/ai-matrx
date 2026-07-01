"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AdminAuditTable, type AuditColumnDef } from "./AdminAuditTable";
import { CanonicalizationToolbar } from "./CanonicalizationToolbar";
import { GateStatusBadge } from "./StatusBadge";
import { useAuditDataset } from "../hooks/useAuditDataset";
import type { CanonicalFindingRow } from "../types";
import type { ColumnFilter } from "@/features/administration/kg-inspector/utils/tableFilters";

export function FindingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { rows, loading, reload } =
    useAuditDataset<CanonicalFindingRow>("findings");

  const statusParam = searchParams.get("status");
  const initialColumnFilters = useMemo<
    Record<string, ColumnFilter> | undefined
  >(
    () =>
      statusParam
        ? { status: { enumValues: [statusParam.toUpperCase()] } }
        : undefined,
    [statusParam],
  );

  const columns: AuditColumnDef<CanonicalFindingRow>[] = useMemo(
    () => [
      {
        key: "schema_name",
        label: "Schema",
        type: "text",
        getValue: (r) => r.schema_name,
        width: "120px",
      },
      {
        key: "table_name",
        label: "Table",
        type: "text",
        getValue: (r) => r.table_name,
        width: "180px",
        copyable: true,
      },
      {
        key: "token",
        label: "Token",
        type: "text",
        getValue: (r) => r.token,
        width: "160px",
        monospace: true,
      },
      {
        key: "check_name",
        label: "Check",
        type: "text",
        getValue: (r) => r.check_name,
        width: "220px",
        monospace: true,
      },
      {
        key: "status",
        label: "Status",
        type: "enum",
        getValue: (r) => r.status,
        width: "100px",
        render: (r) => <GateStatusBadge status={r.status} />,
      },
      {
        key: "source",
        label: "Source",
        type: "enum",
        getValue: (r) => r.source,
        width: "110px",
      },
      {
        key: "detail",
        label: "Detail",
        type: "text",
        getValue: (r) => r.detail,
        width: "minmax(320px, 1fr)",
        copyable: true,
        noValueList: true,
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
          csvFilename="canonicalization-findings.csv"
          defaultSort={{ key: "schema_name", dir: "asc" }}
          initialColumnFilters={initialColumnFilters}
          emptyMessage="No findings — the gate is clean."
          onRowClick={(row) => {
            if (!row.schema_name || !row.table_name || !row.token) return;
            router.push(
              `/administration/canonicalization/verify?schema=${encodeURIComponent(row.schema_name)}&table=${encodeURIComponent(row.table_name)}&token=${encodeURIComponent(row.token)}`,
            );
          }}
        />
      </div>
    </div>
  );
}
