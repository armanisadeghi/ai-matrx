"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AdminAuditTable, type AuditColumnDef } from "./AdminAuditTable";
import { BrokenFunctionKeywordFilterBar } from "./BrokenFunctionKeywordFilterBar";
import { CanonicalizationToolbar } from "./CanonicalizationToolbar";
import { GateStatusBadge } from "./StatusBadge";
import { useAuditDataset } from "../hooks/useAuditDataset";
import { useCanonicalizationDatasetToolbar } from "../hooks/useCanonicalizationDatasetToolbar";
import { isBrokenFunctionRow, type BrokenFunctionRow } from "../types";
import { BROKEN_FUNCTIONS_TABLE_COPY } from "../utils/aiExport";
import {
  EMPTY_KEYWORD_TAG_FILTER,
  filterBrokenFunctionsByKeywords,
  keywordTagFilterActive,
} from "../utils/brokenFunctionKeywordFilter";
import type { ColumnFilter } from "@/features/administration/kg-inspector/utils/tableFilters";
import { jsonUrlCodec, useUrlState } from "@/lib/url-state/useUrlState";

export function BrokenFunctionsPage() {
  const searchParams = useSearchParams();
  const { rows, loading, reload } = useAuditDataset<BrokenFunctionRow>(
    "broken-functions",
    isBrokenFunctionRow,
  );
  const [keywordFilter, setKeywordFilter] = useUrlState(
    "keywords",
    jsonUrlCodec(
      EMPTY_KEYWORD_TAG_FILTER,
      (value): value is typeof EMPTY_KEYWORD_TAG_FILTER => {
        if (!value || typeof value !== "object" || Array.isArray(value))
          return false;
        const candidate = value as Record<string, unknown>;
        return (
          Array.isArray(candidate.include) &&
          candidate.include.every((item) => typeof item === "string") &&
          Array.isArray(candidate.exclude) &&
          candidate.exclude.every((item) => typeof item === "string")
        );
      },
    ),
  );
  const toolbar = useCanonicalizationDatasetToolbar(reload);

  const fnParam = searchParams.get("fn");
  const initialColumnFilters = useMemo<
    Record<string, ColumnFilter> | undefined
  >(
    () => (fnParam ? { function_name: { text: fnParam } } : undefined),
    [fnParam],
  );

  const keywordFilteredRows = useMemo(
    () => filterBrokenFunctionsByKeywords(rows, keywordFilter),
    [rows, keywordFilter],
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
              href={`/administration/database/canonicalization/function-deps?fn=${encodeURIComponent(r.function_name)}`}
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
      <CanonicalizationToolbar
        onReload={reload}
        reloading={loading}
        onRefreshAudit={toolbar.onRefreshAudit}
        refreshingAudit={toolbar.refreshingAudit}
        lastRefreshedAt={toolbar.lastRefreshedAt}
      />
      <BrokenFunctionKeywordFilterBar
        value={keywordFilter}
        onChange={setKeywordFilter}
        totalCount={rows.length}
        filteredCount={keywordFilteredRows.length}
        onClear={() => setKeywordFilter(EMPTY_KEYWORD_TAG_FILTER)}
      />
      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
        <AdminAuditTable
          rows={keywordFilteredRows}
          columns={columns}
          loading={loading}
          csvFilename="canonicalization-broken-functions.csv"
          defaultSort={{ key: "schema_name", dir: "asc" }}
          initialColumnFilters={initialColumnFilters}
          emptyMessage={
            keywordTagFilterActive(keywordFilter)
              ? "No broken functions match these keyword filters."
              : "No broken functions found."
          }
          copyForAi={BROKEN_FUNCTIONS_TABLE_COPY}
        />
      </div>
    </div>
  );
}
