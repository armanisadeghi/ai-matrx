"use client";

// features/mandates/admin/advanced/AdvancedMandateCrud.tsx
//
// THE X-RAY. Raw rows of the relations the mandate cutover actually runs on,
// with browse / edit / insert / delete. No product framing, no polish — the
// column list is whatever the database has right now, and the SQL that
// produced the page is printed on the page.
//
// It renders through the canonical `MatrxDataTable` (search, filters, sort,
// pagination, inline edit + dirty pill, row inspector, row window) — there is
// no second grid in this feature.

import { useCallback, useEffect, useState, useTransition } from "react";
import { AlertTriangle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  CellEditsMap,
  MatrxColumnDef,
} from "@/components/official/matrx-data-table/types";
import { tokenFromColumnName } from "@/components/official/entity-ref/doors";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  advancedDeleteRow,
  advancedInsertRow,
  advancedListRows,
  advancedUpdateRow,
  type AdvancedColumn,
} from "./actions";
import {
  ADVANCED_RELATIONS,
  DEFAULT_RELATION_KEY,
  findRelation,
  relationKey,
} from "./tables";

type Row = Record<string, unknown>;

const PAGE_SIZE = 50;

/** Renders any Postgres value as the text an x-ray should show — never "[object Object]". */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** A jsonb/array column edits as JSON text; everything else as a plain string. */
function isJsonish(column: AdvancedColumn): boolean {
  return column.dataType === "jsonb" || column.dataType === "json" || column.dataType === "ARRAY";
}

export function AdvancedMandateCrud() {
  const [relKey, setRelKey] = useState<string>(DEFAULT_RELATION_KEY);
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<AdvancedColumn[]>([]);
  const [total, setTotal] = useState(0);
  const [sql, setSql] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertJson, setInsertJson] = useState("{\n  \n}");
  const [isPending, startTransition] = useTransition();

  const relation = findRelation(relKey);

  const load = useCallback(() => {
    startTransition(async () => {
      const result = await advancedListRows({
        relation: relKey,
        limit: PAGE_SIZE,
        search,
        includeDeleted,
      });
      if (result.error || !result.data) {
        setError(result.error ?? "The query returned nothing at all.");
        setRows([]);
        setColumns([]);
        setTotal(0);
        setSql("");
        return;
      }
      setError(null);
      setRows(result.data.rows);
      setColumns(result.data.columns);
      setTotal(result.data.total);
      setSql(result.data.sql);
    });
  }, [relKey, search, includeDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  const pk = relation?.pk ?? null;

  // Lead columns first, then everything else in the database's own order. A
  // lead name the database does not have is silently skipped, so this list can
  // never invent a column.
  const present = new Set(columns.map((c) => c.name));
  const ordered: AdvancedColumn[] = [
    ...(relation?.lead ?? [])
      .filter((name) => present.has(name))
      .map((name) => columns.find((c) => c.name === name)!),
    ...columns.filter((c) => !(relation?.lead ?? []).includes(c.name)),
  ];

  const tableColumns: MatrxColumnDef<Row>[] = ordered.map((column) => ({
    id: column.name,
    accessorFn: (row) => renderValue(row[column.name]),
    header: (
      <span className="whitespace-nowrap">
        {column.name}
        <span className="ml-1 text-[10px] text-muted-foreground">{column.dataType}</span>
      </span>
    ),
    cell: (row) => {
      const text = renderValue(row[column.name]);
      if (!text) return <span className="text-muted-foreground">null</span>;
      // Clipped for the grid only — the full value is on the title attribute
      // and in the row inspector, so nothing is hidden, only folded.
      const clipped = text.length > 160 ? `${text.slice(0, 160)}…` : text;
      return (
        <span className="block max-w-[28rem] font-mono text-xs" title={text}>
          {clipped}
        </span>
      );
    },
    editable: relation?.writable && column.name !== pk ? "string" : undefined,
    editTrigger: "pencil",
  }));

  const onSave = async (edits: CellEditsMap) => {
    if (!relation?.writable || !pk) throw new Error("This relation is read-only here.");
    const entries = Object.entries(edits);
    let written = 0;
    for (const [rowId, patch] of entries) {
      // A jsonb / array cell is edited as JSON text; parse it back so Postgres
      // receives real structure and not a quoted string.
      const typed: Row = {};
      for (const [key, value] of Object.entries(patch)) {
        const column = columns.find((c) => c.name === key);
        if (column && isJsonish(column) && typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed === "" ) {
            typed[key] = null;
          } else {
            try {
              typed[key] = JSON.parse(trimmed);
            } catch {
              throw new Error(`${key} must be valid JSON (${column.dataType}).`);
            }
          }
        } else {
          typed[key] = value === "" ? null : value;
        }
      }
      const result = await advancedUpdateRow({ relation: relKey, id: rowId, patch: typed });
      if (result.error) throw new Error(result.error);
      written += 1;
    }
    toast.success(`Wrote ${written} row${written === 1 ? "" : "s"} to ${relKey}.`);
    load();
  };

  const doDelete = async (row: Row, mode: "soft" | "hard") => {
    if (!pk) return;
    const id = String(row[pk]);
    const result = await advancedDeleteRow({ relation: relKey, id, mode });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`${mode === "soft" ? "Soft-deleted" : "HARD-deleted"} ${relKey} ${id}.`);
    load();
  };

  const doInsert = async () => {
    let values: Row;
    try {
      values = JSON.parse(insertJson) as Row;
    } catch (err) {
      toast.error(`Not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const result = await advancedInsertRow({ relation: relKey, values });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Inserted into ${relKey}.`);
    setInsertOpen(false);
    load();
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-semibold">Mandate storage — advanced (raw rows)</h1>
          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            No guardrails: writes bypass RLS and go straight to the table
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Every column the database has, exactly as stored. Database CHECK constraints, triggers
          and foreign keys still apply — a refusal here is the database&apos;s own words.
        </p>
        <div className="mt-3 flex flex-wrap gap-1">
          {ADVANCED_RELATIONS.map((r) => {
            const key = relationKey(r);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setRelKey(key)}
                className={cn(
                  "rounded border px-2 py-1 font-mono text-xs",
                  key === relKey
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {r.label}
                {!r.writable && <span className="ml-1 opacity-60">(read-only)</span>}
              </button>
            );
          })}
        </div>
        {relation && (
          <p className="mt-2 text-xs text-muted-foreground">{relation.blurb}</p>
        )}
      </div>

      {error && (
        <div className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-4 py-2 font-mono text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden px-4 py-3">
        {/* No entity: this X-ray browses whichever raw relation is selected
            (ADVANCED_RELATIONS), so there is no single registered
            EntityTypeToken for "a row here" — the identity changes with
            `relKey`. Copy/AI act on the raw row content only. */}
        <NonEditableContextMenu
          sourceFeature="admin"
          contentSource={{ type: "raw" }}
          contextData={{ content: "" }}
          resolveContextOnOpen={(target) => {
            const id = target
              ?.closest("[data-row-id]")
              ?.getAttribute("data-row-id");
            const row = id
              ? (rows.find((r) => (pk ? String(r[pk]) : JSON.stringify(r)) === id) ??
                null)
              : null;
            if (!row) return null;
            return { content: JSON.stringify(row, null, 2) };
          }}
        >
        <MatrxDataTable<Row>
          data={rows}
          columns={tableColumns}
          getRowId={(row) => (pk ? String(row[pk]) : JSON.stringify(row))}
          isLoading={isPending && rows.length === 0}
          isFetching={isPending}
          pageSize={25}
          zebra
          emptyState={{
            title: "No rows",
            description: `${relKey} returned nothing for this filter.`,
          }}
          detail={{
            title: (row) => (pk ? String(row[pk]) : relKey),
            tokenForField: tokenFromColumnName,
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search the whole row (uuid, key, or a value inside jsonb)…",
            searchValue: search,
            onSearchChange: setSearch,
            // A control is absent or honest: a relation with no soft-delete
            // column has no rows to show, so the toggle is not rendered —
            // never a dead switch the reader has to guess about.
            leading: relation?.softDeletes ? (
              <div className="flex items-center gap-2">
                <Switch
                  id="include-deleted"
                  checked={includeDeleted}
                  onCheckedChange={setIncludeDeleted}
                />
                <Label htmlFor="include-deleted" className="text-xs">
                  Show soft-deleted
                </Label>
              </div>
            ) : undefined,
            actions: (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {rows.length} of {total} row{total === 1 ? "" : "s"}
                </span>
                <Button size="sm" variant="outline" onClick={load} disabled={isPending}>
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Refresh
                </Button>
                {relation?.writable && (
                  <Button size="sm" onClick={() => setInsertOpen(true)}>
                    <Plus className="mr-1 h-3 w-3" />
                    Insert row
                  </Button>
                )}
              </div>
            ),
          }}
          edit={
            relation?.writable && pk
              ? { enabled: true, onSave: (edits) => onSave(edits) }
              : undefined
          }
          rowActions={
            relation?.writable && pk
              ? (row) => (
                  <div className="flex items-center gap-1">
                    {relation.softDeletes && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => doDelete(row, "soft")}
                        title="Set deleted_at = now()"
                      >
                        Soft
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => doDelete(row, "hard")}
                      title="DELETE FROM — permanent"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )
              : undefined
          }
        />
        </NonEditableContextMenu>
      </div>

      {sql && (
        <div className="shrink-0 border-t border-border bg-muted/40 px-4 py-2">
          <p className="font-mono text-[11px] leading-relaxed text-muted-foreground break-all">
            {sql}
          </p>
        </div>
      )}

      <Dialog open={insertOpen} onOpenChange={setInsertOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Insert into {relKey}</DialogTitle>
            <DialogDescription>
              Supply only the columns you want to set — every other column keeps its database
              default. Values are converted by Postgres, so uuid, jsonb, arrays and enums all
              take their natural JSON form.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={insertJson}
              onChange={(e) => setInsertJson(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Columns available:{" "}
              <span className="font-mono">{columns.map((c) => c.name).join(", ")}</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInsertOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doInsert}>Insert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
