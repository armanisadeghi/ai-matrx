"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AdminAuditTable, type AuditColumnDef } from "./AdminAuditTable";
import { CanonicalizationToolbar } from "./CanonicalizationToolbar";
import { GateStatusBadge } from "./StatusBadge";
import { useAuditDataset } from "../hooks/useAuditDataset";
import type { BrokenFunctionRow } from "../types";
import type { ColumnFilter } from "@/features/administration/kg-inspector/utils/tableFilters";

export function BrokenFunctionsPage() {
  const searchParams = useSearchParams();
  const { rows, loading, reload } =
    useAuditDataset<BrokenFunctionRow>("broken-functions");

  const fnParam = searchParams.get("fn");
  const initialColumnFilters = useMemo<
    Record<string, ColumnFilter> | undefined
  >(
    () => (fnParam ? { function_name: { text: fnParam } } : undefined),
    [fnParam],
  );

  const columns: AuditColumnDef<BrokenFunctionRow>[] = useMemo(
    () => [
      {
        key: "schema_name",
        label: "Schema",
        type: "text",
        getValue: (r) => r.schema_name,
        width: "120px",
      },
      {
        key: "function_name",
        label: "Function",
        type: "text",
        getValue: (r) => r.function_name,
        width: "220px",
        monospace: true,
        copyable: true,
      },
      {
        key: "signature",
        label: "Signature",
        type: "text",
        getValue: (r) => r.signature,
        width: "minmax(220px, 1fr)",
        monospace: true,
        noValueList: true,
      },
      {
        key: "lineno",
        label: "Line",
        type: "number",
        getValue: (r) => r.lineno,
        width: "80px",
        align: "right",
      },
      {
        key: "level",
        label: "Level",
        type: "enum",
        getValue: (r) => r.level,
        width: "100px",
        render: (r) => <GateStatusBadge status={r.level} />,
      },
      {
        key: "sqlstate",
        label: "SQLSTATE",
        type: "text",
        getValue: (r) => r.sqlstate,
        width: "110px",
        monospace: true,
      },
      {
        key: "message",
        label: "Message",
        type: "text",
        getValue: (r) => r.message,
        width: "minmax(280px, 1fr)",
        copyable: true,
        noValueList: true,
      },
      {
        key: "context",
        label: "Deps",
        type: "text",
        getValue: () => "",
        sortable: false,
        filterable: false,
        width: "90px",
        align: "right",
        render: (r) =>
          r.function_name ? (
            <Link
              href={`/administration/canonicalization/function-deps?fn=${encodeURIComponent(r.function_name)}`}
              className="text-xs text-primary hover:underline"
            >
              View →
            </Link>
          ) : null,
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
          csvFilename="canonicalization-broken-functions.csv"
          defaultSort={{ key: "schema_name", dir: "asc" }}
          initialColumnFilters={initialColumnFilters}
          emptyMessage="No broken functions found."
        />
      </div>
    </div>
  );
}
