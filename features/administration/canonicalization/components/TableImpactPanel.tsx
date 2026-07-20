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
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";

import { AdminAuditTable, type AuditColumnDef } from "./AdminAuditTable";
import { BoolBadge } from "./StatusBadge";
import { SchemaTableFields } from "./SchemaTableFields";
import type { TableImpactRow } from "../types";
import { errorMessageFrom, readJsonObject } from "../utils/apiClient";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  TABLE_IMPACT_TABLE_COPY,
  tableImpactRunToAgentInput,
  tableImpactRunToHuman,
} from "../utils/aiExport";

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
  const [schema, setSchema] = useState(() => searchParams.get("schema") ?? "");
  const [table, setTable] = useState(() => searchParams.get("table") ?? "");
  const [rows, setRows] = useState<TableImpactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const runImpact = useCallback(
    async (override?: { schema: string; table: string }) => {
      const target = override ?? { schema: schema.trim(), table: table.trim() };
      if (!target.schema || !target.table) {
        toast.error("Schema and table are required");
        return;
      }
      setSchema(target.schema);
      setTable(target.table);
      setLoading(true);
      setHasRun(true);
      try {
        const res = await fetch("/api/admin/canonicalization/table-impact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(target),
        });
        const data = await readJsonObject(res);
        if (!res.ok) throw new Error(errorMessageFrom(data, res));
        const nextRows: unknown[] = Array.isArray(data.rows) ? data.rows : [];
        setRows(nextRows.filter(isTableImpactRow));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [schema, table],
  );

  useEffect(() => {
    const s = searchParams.get("schema");
    const t = searchParams.get("table");
    if (s && t) void runImpact({ schema: s, table: t });
    // Only run once on mount for the deep-link case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brokenCount = rows.filter((r) => r.currently_broken).length;

  const impactSnapshot = useMemo(
    () =>
      schema.trim() && table.trim() && hasRun
        ? {
            schema: schema.trim(),
            table: table.trim(),
            rows,
          }
        : null,
    [schema, table, hasRun, rows],
  );

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
        <SchemaTableFields
          values={{ schema, table }}
          onChange={(patch) => {
            if (patch.schema !== undefined) setSchema(patch.schema);
            if (patch.table !== undefined) setTable(patch.table);
          }}
          disabled={loading}
        />
        <Button size="sm" onClick={() => void runImpact()} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="mr-1.5 h-3.5 w-3.5" />
          )}
          Run preflight
        </Button>
        {impactSnapshot && impactSnapshot.rows.length > 0 ? (
          <CopyButtons
            size="sm"
            label={`Table impact · ${impactSnapshot.schema}.${impactSnapshot.table}`}
            human={() => tableImpactRunToHuman(impactSnapshot)}
            agent={() => tableImpactRunToAgentInput(impactSnapshot)}
          />
        ) : null}
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
              : "Choose a table above and run preflight."
          }
          copyForAi={TABLE_IMPACT_TABLE_COPY}
        />
      </div>
    </div>
  );
}
