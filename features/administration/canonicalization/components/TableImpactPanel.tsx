"use client";

/**
 * features/administration/canonicalization/components/TableImpactPanel.tsx
 *
 * Preflight blast-radius tool — `audit.table_impact(schema, table)` — every
 * function touching a table, whether the dependency is precise or
 * text-qualified, whether it's currently broken, and the exact referenced
 * columns. Run this BEFORE any rename/drop (docs/canonicalization_worklog.md §5b).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";

import { BoolBadge } from "./StatusBadge";
import { SchemaTableFields } from "./SchemaTableFields";
import type { TableImpactRow } from "../types";
import { errorMessageFrom, readJsonObject } from "../utils/apiClient";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  tableImpactRunToAgentInput,
  tableImpactRunToHuman,
} from "../utils/aiExport";
import {
  booleanUrlCodec,
  stringUrlCodec,
  useUrlState,
} from "@ai-matrx/kit/url-state";

function isTableImpactRow(v: unknown): v is TableImpactRow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    (typeof r.function_sig === "string" || r.function_sig === null) &&
    (typeof r.dependency === "string" || r.dependency === null) &&
    (typeof r.currently_broken === "boolean" || r.currently_broken === null)
  );
}

export function TableImpactPanel() {
  const searchParams = useSearchParams();
  const initialDeepLink = useRef(
    Boolean(searchParams.get("schema") && searchParams.get("table")),
  );
  const [schema, setSchema] = useUrlState("schema", stringUrlCodec());
  const [table, setTable] = useUrlState("table", stringUrlCodec());
  const [hasRun, setHasRun] = useUrlState("run", booleanUrlCodec(false));
  const targetKey = JSON.stringify([schema.trim(), table.trim()]);
  const [snapshot, setSnapshot] = useState<{ key: string; rows: TableImpactRow[] } | null>(null);
  const rows = snapshot?.key === targetKey ? snapshot.rows : [];
  const [pendingRequest, setPendingRequest] = useState<{ key: string; id: number } | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);
  const readError = errorState?.key === targetKey ? errorState.message : null;
  const requestVersion = useRef(0);
  const loading = hasRun && pendingRequest?.key === targetKey;

  const runImpact = useCallback(async () => {
    const target = { schema: schema.trim(), table: table.trim() };
    if (!target.schema || !target.table) {
      toast.error("Schema and table are required");
      return;
    }
    const key = JSON.stringify([target.schema, target.table]);
    const requestId = ++requestVersion.current;
    setPendingRequest({ key, id: requestId });
    setErrorState(null);
    try {
      const res = await fetch("/api/admin/canonicalization/table-impact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      const data = await readJsonObject(res);
      if (!res.ok) throw new Error(errorMessageFrom(data, res));
      const nextRows: unknown = data.rows;
      if (!Array.isArray(nextRows) || !nextRows.every(isTableImpactRow)) {
        throw new Error("Preflight returned an invalid dependency list");
      }
      if (requestId === requestVersion.current) setSnapshot({ key, rows: nextRows.filter(isTableImpactRow) });
    } catch (err) {
      if (requestId !== requestVersion.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setErrorState({ key, message });
      toast.error(message);
    } finally {
      if (requestId === requestVersion.current) setPendingRequest(null);
    }
  }, [schema, table]);

  useEffect(() => {
    requestVersion.current += 1;
  }, [targetKey, hasRun]);

  useEffect(() => {
    if (!initialDeepLink.current) return;
    initialDeepLink.current = false;
    setHasRun(true);
  }, [setHasRun]);

  useEffect(() => {
    if (hasRun && schema.trim() && table.trim()) void runImpact();
  }, [hasRun, runImpact, schema, table]);

  const brokenCount = rows.filter((r) => r.currently_broken).length;

  const columns: MatrxColumnDef<TableImpactRow>[] = useMemo(
    () => [
      {
        id: "function_sig",
        header: "Function",
        label: "Function",
        accessorFn: (r) => r.function_sig,
        filter: "text",
        width: 280,
        cell: (r) => {
          const value = r.function_sig ?? "—";
          return (
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate font-mono" title={value}>
                {value}
              </span>
              {r.function_sig ? (
                <CopyButtons
                  size="icon"
                  label="Function signature"
                  human={r.function_sig}
                  agent={r.function_sig}
                  hide={["ai", "export"]}
                />
              ) : null}
            </div>
          );
        },
      },
      {
        id: "dependency",
        header: "Dependency",
        label: "Dependency",
        accessorFn: (r) => r.dependency,
        filter: "select",
        width: 150,
      },
      {
        id: "currently_broken",
        header: "Broken?",
        label: "Broken?",
        accessorFn: (r) => r.currently_broken,
        filter: "boolean",
        width: 110,
        cell: (r) => (
          <BoolBadge
            value={r.currently_broken}
            invert
            trueLabel="Broken"
            falseLabel="OK"
          />
        ),
      },
      {
        id: "referenced_columns",
        header: "Referenced columns",
        label: "Referenced columns",
        accessorFn: (r) => (r.referenced_columns ?? []).join(", "),
        filter: "text",
        width: 260,
        cell: (r) => {
          const value = (r.referenced_columns ?? []).join(", ") || "—";
          return (
            <span className="block truncate font-mono" title={value}>
              {value}
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3 pt-3">
        <SchemaTableFields
          values={{ schema, table }}
          onChange={(patch) => {
            if (patch.schema !== undefined) setSchema(patch.schema);
            if (patch.table !== undefined) setTable(patch.table);
            setHasRun(false);
            requestVersion.current += 1;
            setPendingRequest(null);
            setSnapshot(null);
            setErrorState(null);
          }}
          disabled={loading}
        />
        <Button
          size="sm"
          onClick={() => {
            if (hasRun) void runImpact();
            else setHasRun(true);
          }}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="mr-1.5 h-3.5 w-3.5" />
          )}
          Run preflight
        </Button>
      </div>

      {hasRun && !readError && brokenCount > 0 ? (
        <div className="mx-4 mb-3 flex shrink-0 items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {brokenCount} dependent function{brokenCount === 1 ? "" : "s"}{" "}
          currently broken — fix these before or as part of this migration.
        </div>
      ) : null}

      {readError ? (
        <div role="alert" className="mx-4 mb-3 flex shrink-0 items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span>Preflight could not be read: {readError}. {rows.length ? "The last successful result remains below; it may be stale." : "There is no verified result for this table."}</span>
          <Button size="sm" variant="outline" disabled={loading} onClick={() => void runImpact()}>Retry</Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
        <MatrxDataTable<TableImpactRow>
          data={rows}
          columns={columns}
          getRowId={(row) =>
            [
              row.function_sig ?? "",
              row.dependency ?? "",
              String(row.currently_broken),
              (row.referenced_columns ?? []).join(","),
            ].join("|")
          }
          isLoading={loading}
          pageSize={50}
          virtualize={{ enabled: true, rowHeight: 34, overscan: 12, threshold: 1 }}
          urlState={{
            id: "canonicalization-table-impact",
            defaultSort: { id: "currently_broken", direction: "desc" },
          }}
          coverage={{ loaded: rows.length, noun: "dependent function" }}
          toolbar={{ search: true, searchPlaceholder: "Search dependent functions…" }}
          emptyState={{
            title: readError
              ? "Preflight unavailable"
              : hasRun
                ? "No dependent functions found"
                : "Choose a table and run preflight",
            description: readError
              ? "Retry the read before changing this table."
              : hasRun
                ? "No functions reference this table in the current preflight result."
                : "Choose a schema and table above to inspect its dependent functions.",
          }}
          detail={{ enabled: false }}
          copy={{
            label: "Table impact row",
            listLabel: "Table impact",
            location: "/administration/database/canonicalization/table-impact",
            rowKind: "canonicalization-table-impact-row",
            listKind: "canonicalization-table-impact-rows",
            rowDescription:
              "One dependent function row from audit.table_impact(schema, table).",
            listDescription: "Blast-radius rows visible after filters.",
            humanRow: (row) =>
              [
                `Function: ${row.function_sig ?? "?"}`,
                `Dependency: ${row.dependency ?? "?"}`,
                `Currently broken: ${row.currently_broken ? "yes" : "no"}`,
                `Referenced columns: ${(row.referenced_columns ?? []).join(", ") || "—"}`,
              ].join("\n"),
            listHuman: (visible) =>
              tableImpactRunToHuman({
                schema: schema.trim(),
                table: table.trim(),
                rows: visible,
              }),
            listAgent: (visible) =>
              tableImpactRunToAgentInput({
                schema: schema.trim(),
                table: table.trim(),
                rows: visible,
              }),
            rowAttributes: (row) => ({
              broken: row.currently_broken,
              dependency: row.dependency,
            }),
            listAttributes: (visible, all) => ({
              count: visible.length,
              total: all.length,
              broken: visible.filter((row) => row.currently_broken).length,
            }),
          }}
        />
      </div>
    </div>
  );
}
