"use client";

/**
 * features/administration/canonicalization/components/TableImpactPanel.tsx
 *
 * Preflight blast-radius tool — `audit.table_impact(schema, table)` — every
 * function touching a table, whether the dependency is precise or
 * text-qualified, whether it's currently broken, and the exact referenced
 * columns. Run this BEFORE any rename/drop (docs/canonicalization_worklog.md §5b).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { AdminAuditTable, type AuditColumnDef } from "./AdminAuditTable";
import { BoolBadge } from "./StatusBadge";
import type { KnownTableRef, TableImpactRow } from "../types";
import { errorMessageFrom, readJsonObject } from "../utils/apiClient";

function isKnownTableRef(v: unknown): v is KnownTableRef {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).schema_name === "string" &&
    typeof (v as Record<string, unknown>).table_name === "string"
  );
}

function isTableImpactRow(v: unknown): v is TableImpactRow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    (typeof r.function_sig === "string" || r.function_sig === null) &&
    (typeof r.dependency === "string" || r.dependency === null) &&
    (typeof r.currently_broken === "boolean" || r.currently_broken === null)
  );
}

function parseSchemaTable(input: string): [string, string] | null {
  const idx = input.indexOf(".");
  if (idx <= 0 || idx === input.length - 1) return null;
  return [input.slice(0, idx).trim(), input.slice(idx + 1).trim()];
}

export function TableImpactPanel() {
  const searchParams = useSearchParams();
  const [tables, setTables] = useState<KnownTableRef[]>([]);
  const [input, setInput] = useState(() => {
    const s = searchParams.get("schema");
    const t = searchParams.get("table");
    return s && t ? `${s}.${t}` : "";
  });
  const [rows, setRows] = useState<TableImpactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    fetch("/api/admin/canonicalization/table-impact")
      .then(readJsonObject)
      .then((data) => {
        // Widen JsonValue[] -> unknown[] so the type-predicate filter overload
        // applies (KnownTableRef doesn't extend JsonValue's index signature).
        const tables: unknown[] = Array.isArray(data.tables) ? data.tables : [];
        setTables(tables.filter(isKnownTableRef));
      })
      .catch(() => undefined);
  }, []);

  const runImpact = useCallback(
    async (override?: [string, string]) => {
      const parsed = override ?? parseSchemaTable(input);
      if (!parsed) {
        toast.error('Enter a table as "schema.table", e.g. public.notes');
        return;
      }
      const [schema, table] = parsed;
      setLoading(true);
      setHasRun(true);
      try {
        const res = await fetch("/api/admin/canonicalization/table-impact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schema, table }),
        });
        const data = await readJsonObject(res);
        if (!res.ok) throw new Error(errorMessageFrom(data, res));
        const rows: unknown[] = Array.isArray(data.rows) ? data.rows : [];
        setRows(rows.filter(isTableImpactRow));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [input],
  );

  useEffect(() => {
    const s = searchParams.get("schema");
    const t = searchParams.get("table");
    if (s && t) void runImpact([s, t]);
    // Only run once on mount for the deep-link case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brokenCount = rows.filter((r) => r.currently_broken).length;

  const columns: AuditColumnDef<TableImpactRow>[] = useMemo(
    () => [
      {
        key: "function_sig",
        label: "Function",
        type: "text",
        getValue: (r) => r.function_sig,
        width: "minmax(280px, 1fr)",
        monospace: true,
        copyable: true,
        noValueList: true,
      },
      {
        key: "dependency",
        label: "Dependency",
        type: "enum",
        getValue: (r) => r.dependency,
        width: "150px",
      },
      {
        key: "currently_broken",
        label: "Broken?",
        type: "enum",
        getValue: (r) => String(r.currently_broken),
        width: "110px",
        render: (r) => (
          <BoolBadge
            value={r.currently_broken}
            invert
            trueLabel="Broken"
            falseLabel="OK"
          />
        ),
      },
      {
        key: "referenced_columns",
        label: "Referenced columns",
        type: "text",
        getValue: (r) => (r.referenced_columns ?? []).join(", "),
        width: "minmax(220px, 1fr)",
        monospace: true,
        noValueList: true,
      },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3 pt-3">
        <Input
          list="canonicalization-known-tables"
          placeholder="schema.table — e.g. public.notes"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runImpact();
          }}
          className="h-9 max-w-sm text-base"
        />
        <datalist id="canonicalization-known-tables">
          {tables.map((t) => (
            <option
              key={`${t.schema_name}.${t.table_name}`}
              value={`${t.schema_name}.${t.table_name}`}
            />
          ))}
        </datalist>
        <Button size="sm" onClick={() => void runImpact()} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="mr-1.5 h-3.5 w-3.5" />
          )}
          Run preflight
        </Button>
      </div>

      {hasRun && brokenCount > 0 ? (
        <div className="mx-4 mb-3 flex shrink-0 items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {brokenCount} dependent function{brokenCount === 1 ? "" : "s"}{" "}
          currently broken — fix these before or as part of this migration.
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
        <AdminAuditTable
          rows={rows}
          columns={columns}
          loading={loading}
          csvFilename="canonicalization-table-impact.csv"
          defaultSort={{ key: "currently_broken", dir: "desc" }}
          emptyMessage={
            hasRun
              ? "No dependent functions found."
              : "Enter a table above and run preflight."
          }
        />
      </div>
    </div>
  );
}
