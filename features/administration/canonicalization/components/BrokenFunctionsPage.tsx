"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AdminAuditTable, type AuditColumnDef } from "./AdminAuditTable";
import { BrokenFunctionKeywordFilterBar } from "./BrokenFunctionKeywordFilterBar";
import {
  BrokenFunctionSeverityFilterBar,
  DEFAULT_SEVERITY_FILTER,
  SEVERITY_HINTS,
} from "./BrokenFunctionSeverityFilterBar";
import { CanonicalizationToolbar } from "./CanonicalizationToolbar";
import { GateStatusBadge, SeverityBadge } from "./StatusBadge";
import { useAuditDataset } from "../hooks/useAuditDataset";
import { useCanonicalizationDatasetToolbar } from "../hooks/useCanonicalizationDatasetToolbar";
import {
  BROKEN_FUNCTION_SEVERITIES,
  isBrokenFunctionRow,
  isBrokenFunctionSeverity,
  type BrokenFunctionRow,
  type BrokenFunctionSeverity,
} from "../types";
import { BROKEN_FUNCTIONS_TABLE_COPY } from "../utils/aiExport";
import {
  EMPTY_KEYWORD_TAG_FILTER,
  filterBrokenFunctionsByKeywords,
  keywordTagFilterActive,
} from "../utils/brokenFunctionKeywordFilter";
import type { ColumnFilter } from "@/features/administration/kg-inspector/utils/tableFilters";
import {
  booleanUrlCodec,
  jsonUrlCodec,
  useUrlState,
} from "@/lib/url-state/useUrlState";

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
  // Severity gate, applied BEFORE the keyword filters. Defaults to `real` so the
  // page opens on the rows a human can act on (3 signatures out of 94 rows as of
  // 2026-08-13); every other class is one chip-click away with its count shown.
  const [severityFilter, setSeverityFilter] = useUrlState(
    "severity",
    jsonUrlCodec(
      DEFAULT_SEVERITY_FILTER,
      (value): value is BrokenFunctionSeverity[] =>
        Array.isArray(value) && value.every(isBrokenFunctionSeverity),
    ),
  );
  const [includeUnclassified, setIncludeUnclassified] = useUrlState(
    "unclassified",
    booleanUrlCodec(false),
  );
  const toolbar = useCanonicalizationDatasetToolbar(reload);

  const severityCounts = useMemo(() => {
    const counts = Object.fromEntries(
      BROKEN_FUNCTION_SEVERITIES.map((s) => [s, 0]),
    ) as Record<BrokenFunctionSeverity, number>;
    let unclassified = 0;
    for (const row of rows) {
      if (row.severity && row.severity in counts) counts[row.severity] += 1;
      else unclassified += 1;
    }
    return { counts, unclassified };
  }, [rows]);

  const severityFilteredRows = useMemo(
    () =>
      rows.filter((row) =>
        row.severity
          ? severityFilter.includes(row.severity)
          : includeUnclassified,
      ),
    [rows, severityFilter, includeUnclassified],
  );

  const fnParam = searchParams.get("fn");
  const initialColumnFilters = useMemo<
    Record<string, ColumnFilter> | undefined
  >(
    () => (fnParam ? { function_name: { text: fnParam } } : undefined),
    [fnParam],
  );

  const keywordFilteredRows = useMemo(
    () => filterBrokenFunctionsByKeywords(severityFilteredRows, keywordFilter),
    [severityFilteredRows, keywordFilter],
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
        key: "severity",
        label: "Severity",
        type: "enum",
        getValue: (r) => r.severity ?? "unclassified",
        width: "120px",
        render: (r) => (
          <span title={r.severity ? SEVERITY_HINTS[r.severity] : undefined}>
            <SeverityBadge severity={r.severity} />
          </span>
        ),
      },
      {
        key: "suppression_reason",
        label: "Why not real",
        type: "enum",
        getValue: (r) => r.suppression_reason,
        width: "200px",
        monospace: true,
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
      <BrokenFunctionSeverityFilterBar
        value={severityFilter}
        onChange={setSeverityFilter}
        counts={severityCounts.counts}
        unclassifiedCount={severityCounts.unclassified}
        includeUnclassified={includeUnclassified}
        onToggleUnclassified={setIncludeUnclassified}
      />
      <BrokenFunctionKeywordFilterBar
        value={keywordFilter}
        onChange={setKeywordFilter}
        totalCount={severityFilteredRows.length}
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
              ? "No functions match these keyword filters."
              : severityFilter.length === 1 && severityFilter[0] === "real"
                ? "No genuine runtime breakage. Widen the severity chips above to see style warnings and checker artifacts."
                : "No functions match the selected severities."
          }
          copyForAi={BROKEN_FUNCTIONS_TABLE_COPY}
        />
      </div>
    </div>
  );
}
