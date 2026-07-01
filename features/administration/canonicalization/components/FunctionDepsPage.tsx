"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AdminAuditTable, type AuditColumnDef } from "./AdminAuditTable";
import { CanonicalizationToolbar } from "./CanonicalizationToolbar";
import { useAuditDataset } from "../hooks/useAuditDataset";
import type { FunctionDepRow } from "../types";
import type { ColumnFilter } from "@/features/administration/kg-inspector/utils/tableFilters";

export function FunctionDepsPage() {
  const searchParams = useSearchParams();
  const { rows, loading, reload } =
    useAuditDataset<FunctionDepRow>("function-deps");

  const fnParam = searchParams.get("fn");
  const initialColumnFilters = useMemo<
    Record<string, ColumnFilter> | undefined
  >(
    () => (fnParam ? { function_name: { text: fnParam } } : undefined),
    [fnParam],
  );

  const columns: AuditColumnDef<FunctionDepRow>[] = useMemo(
    () => [
      {
        key: "function_schema",
        label: "Fn schema",
        type: "text",
        getValue: (r) => r.function_schema,
        width: "120px",
      },
      {
        key: "function_name",
        label: "Function",
        type: "text",
        getValue: (r) => r.function_name,
        width: "200px",
        monospace: true,
        copyable: true,
      },
      {
        key: "signature",
        label: "Signature",
        type: "text",
        getValue: (r) => r.signature,
        width: "minmax(200px, 1fr)",
        monospace: true,
        noValueList: true,
      },
      {
        key: "dep_type",
        label: "Dep type",
        type: "enum",
        getValue: (r) => r.dep_type,
        width: "120px",
      },
      {
        key: "dep_schema",
        label: "Dep schema",
        type: "text",
        getValue: (r) => r.dep_schema,
        width: "120px",
      },
      {
        key: "dep_name",
        label: "Dep object",
        type: "text",
        getValue: (r) => r.dep_name,
        width: "220px",
        monospace: true,
        copyable: true,
      },
      {
        key: "broken",
        label: "Broken?",
        type: "text",
        getValue: () => "",
        sortable: false,
        filterable: false,
        width: "100px",
        align: "right",
        render: (r) =>
          r.function_name ? (
            <Link
              href={`/administration/canonicalization/broken-functions?fn=${encodeURIComponent(r.function_name)}`}
              className="text-xs text-primary hover:underline"
            >
              Check →
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
          csvFilename="canonicalization-function-deps.csv"
          defaultSort={{ key: "function_schema", dir: "asc" }}
          initialColumnFilters={initialColumnFilters}
          emptyMessage="No dependency edges found."
        />
      </div>
    </div>
  );
}
