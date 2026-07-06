"use client";

import { useCallback, useMemo } from "react";

import { useAuditDataset } from "../hooks/useAuditDataset";
import { isAuditSummaryRow, type AuditSummaryRow } from "../types";

/**
 * Registered tables from `audit.summary` — schema, table, and token options
 * for verify / table-impact pickers. Supports free-text override at the UI
 * layer; this hook only supplies the known-good suggestions.
 */
export function useRegisteredTables() {
  const { rows, loading, error, reload } = useAuditDataset(
    "summary",
    isAuditSummaryRow,
  );

  const schemas = useMemo(
    () => [...new Set(rows.map((r) => r.schema_name))].sort(),
    [rows],
  );

  const tablesForSchema = useCallback(
    (schema: string) => {
      const scoped = schema.trim()
        ? rows.filter((r) => r.schema_name === schema.trim())
        : rows;
      return [...new Set(scoped.map((r) => r.table_name))].sort();
    },
    [rows],
  );

  const tokensFor = useCallback(
    (schema: string, table: string) => {
      const s = schema.trim();
      const t = table.trim();
      if (!s || !t) return [];
      return [
        ...new Set(
          rows
            .filter((r) => r.schema_name === s && r.table_name === t)
            .map((r) => r.token),
        ),
      ].sort();
    },
    [rows],
  );

  const lookupSummaryRow = useCallback(
    (schema: string, table: string): AuditSummaryRow | null => {
      const s = schema.trim();
      const t = table.trim();
      if (!s || !t) return null;
      return (
        rows.find((r) => r.schema_name === s && r.table_name === t) ?? null
      );
    },
    [rows],
  );

  const lookupToken = useCallback(
    (schema: string, table: string): string | null =>
      lookupSummaryRow(schema, table)?.token ?? null,
    [lookupSummaryRow],
  );

  const quickPickOptions = useMemo(
    () =>
      rows.map((r) => `${r.schema_name}.${r.table_name} · ${r.token}` as const),
    [rows],
  );

  const applyQuickPick = useCallback(
    (
      label: string,
    ): { schema: string; table: string; token: string } | null => {
      const row = rows.find(
        (r) => `${r.schema_name}.${r.table_name} · ${r.token}` === label,
      );
      if (!row) return null;
      return {
        schema: row.schema_name,
        table: row.table_name,
        token: row.token,
      };
    },
    [rows],
  );

  return {
    rows,
    loading,
    error,
    reload,
    schemas,
    tablesForSchema,
    tokensFor,
    lookupToken,
    lookupSummaryRow,
    quickPickOptions,
    applyQuickPick,
  };
}
