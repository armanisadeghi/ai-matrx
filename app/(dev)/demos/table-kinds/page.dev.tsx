"use client";

/**
 * Table Kinds Run — Stage B live demo (data-to-kinds queue row 4).
 *
 * ZERO mocks, zero pasted fixtures. It calls the REAL aidream endpoint
 * (`POST /api/table-kinds/read`), which resolves a registered matrx-orm model
 * for the named table, reads real rows through the same select path the live
 * SQL graph action uses, and streams back THREE things in one event: the KIND
 * (`data_table`, carrying the column types the ORM already knew), the LEGACY
 * flat `{rows, row_count, command}` the live node emits from that identical
 * read, and a per-column TYPE-LOSS report. The kind renders through
 * `KindInstanceRender` — the production route path — not through a component
 * this page imports.
 *
 * TWO TABS:
 *
 *  1. TABLE — the typed rendering. Change the limit to watch truncation switch
 *     on and off: a small limit truncates (amber banner, "N of M"), a limit
 *     larger than the table does not.
 *  2. WHAT THE LEGACY SHAPE LOSES — the legacy payload beside ours, plus the
 *     type-loss report. THIS TAB IS THE ARGUMENT FOR THE STAGE D REPOINT.
 *     Verified live on `seo.serp_opportunity`: 28 of 28 columns typed off a
 *     real table (uuid, integer, array/TEXT[], datetime/TIMESTAMP,
 *     number/NUMERIC, json/JSONB) — while the legacy shape carries NO column
 *     list at all, so a consumer receiving "2026-08-16T09:52:46+00:00" cannot
 *     tell a timestamp from a string that looks like one, and cannot tell an
 *     exact NUMERIC from the float it was rounded through.
 *
 * READ-ONLY BY CONSTRUCTION: the endpoint has no write path. A demo route that
 * can write is a demo route that will.
 */

import { useState } from "react";
import { AlertTriangle, Play, ScanSearch, Table2 } from "lucide-react";
import { useBackendApi } from "@/hooks/useBackendApi";
import { consumeStream } from "@/lib/api/stream-parser";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";

// ── wire readers (defensive; the server owns the shapes) ────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function int(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

interface TypeLossRow {
  column: string;
  recoveredType: string | null;
  sourceType: string | null;
  lostBecause: string;
}

interface Outcome {
  result: Record<string, unknown>;
  legacy: Record<string, unknown> | null;
  typeLoss: TypeLossRow[];
}

function readTypeLoss(value: unknown): TypeLossRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) =>
    isRecord(row) && typeof row.column === "string"
      ? [
          {
            column: row.column,
            recoveredType: str(row.recovered_type),
            sourceType: str(row.source_type),
            lostBecause: str(row.lost_because) ?? "(no reason recorded)",
          },
        ]
      : [],
  );
}

/** Columns the KIND declares — the other half of the comparison. */
function kindColumns(result: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(result.columns) ? result.columns.filter(isRecord) : [];
}

export default function TableKindsDemoPage() {
  const { post } = useBackendApi();
  const [table, setTable] = useState("seo.serp_opportunity");
  const [limit, setLimit] = useState("5");
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const run = async () => {
    if (phase === "running") return;
    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      toast.error("Limit must be a whole number between 1 and 100.");
      return;
    }
    setPhase("running");
    setOutcome(null);
    try {
      const response = await post("/table-kinds/read", {
        table: table.trim(),
        limit: parsedLimit,
      });
      let received: Outcome | null = null;
      await consumeStream(response, {
        onData: (data) => {
          if (
            isRecord(data) &&
            data.type === "table_kinds_result" &&
            isRecord(data.result)
          ) {
            received = {
              result: data.result,
              legacy: isRecord(data.legacy) ? data.legacy : null,
              typeLoss: readTypeLoss(data.type_loss),
            };
          }
        },
        onError: (e) => {
          throw new Error(e.user_message || e.message || "The read failed.");
        },
      });
      if (!received) {
        throw new Error("The stream ended without a table_kinds_result event.");
      }
      setOutcome(received);
      setPhase("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The read failed.");
      setPhase(outcome ? "done" : "idle");
    }
  };

  const columns = outcome ? kindColumns(outcome.result) : [];
  const typedColumns = columns.filter((column) => str(column.type) !== null).length;
  const legacyRows = Array.isArray(outcome?.legacy?.rows) ? outcome.legacy.rows : [];
  const truncated = outcome?.result.truncated === true;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Table Kinds — live demo
        </h1>
        <p className="text-sm text-muted-foreground">
          A REAL read of a real table, through the same registered-model select
          path the live <code className="text-xs">admin.sql.select</code> node
          uses, returned as <code className="text-xs">data_table</code> and
          rendered entirely through the registered kind component. A SQL result,
          a user data-table lookup, a parsed CSV and a table lifted out of a PDF
          are ONE shape — this is it. No mocks.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <label className="flex min-w-64 flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            Schema-qualified table
          </span>
          <Input
            value={table}
            onChange={(e) => setTable(e.target.value)}
            placeholder="seo.serp_opportunity"
          />
        </label>
        <label className="flex w-28 flex-col gap-1">
          <span className="text-xs text-muted-foreground">Limit (1–100)</span>
          <Input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <Button type="submit" disabled={phase === "running"}>
          <Play className="mr-1.5 h-4 w-4" />
          Read
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        Try <strong>limit 3</strong> and then <strong>limit 100</strong> on the
        same table: a limit smaller than the table TRUNCATES and says so in the
        banner, and a limit larger than it does not. Four producers of this shape
        capped their rows silently — a user reading 500 of 40,000 had no way to
        know, which is the defect the <code className="text-xs">truncated</code>{" "}
        field exists to close. Read-only: this endpoint has no write path.
      </p>

      {phase === "running" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Resolving the model → reading rows → adapter → kind…
        </div>
      )}

      {outcome && (
        <Tabs defaultValue="table" className="w-full">
          <TabsList>
            <TabsTrigger value="table">
              <Table2 className="mr-1.5 h-4 w-4" />
              Table
            </TabsTrigger>
            <TabsTrigger value="loss">
              <ScanSearch className="mr-1.5 h-4 w-4" />
              What the legacy shape loses
              {outcome.typeLoss.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px]">
                  {outcome.typeLoss.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── 1. The typed rendering ───────────────────────────────────── */}
          <TabsContent value="table" className="space-y-3">
            <KindInstanceRender
              kind="data_table"
              value={outcome.result}
              showRoutingNote
            />
            <p className="text-xs text-muted-foreground">
              {`${typedColumns} of ${columns.length} ${
                columns.length === 1 ? "column" : "columns"
              } arrived with a declared type. `}
              A column WITHOUT one renders differently on purpose — an
              undeclared type is not a synonym for &ldquo;string&rdquo;, and a
              cell in such a column is never sniffed or coerced. Guessing is how
              a ZIP code loses its leading zero.
              {truncated
                ? " This read was truncated, and the banner above says so."
                : " This read was not truncated — lower the limit to see the banner."}
            </p>
          </TabsContent>

          {/* ── 2. The argument for the Stage D repoint ──────────────────── */}
          <TabsContent value="loss" className="space-y-3">
            <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <AlertTriangle className="h-4 w-4 text-warning" />
                The node held full type metadata for {typedColumns} of{" "}
                {columns.length} columns and the legacy shape carries none of it.
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Same read, both columns below. Arbitrary SQL is disabled, so
                every live path resolves a registered matrx-orm Model first —
                which means, at the moment the legacy output is built, the node
                is holding a field class, a Python type, a DB column type and
                nullability for every column, and then discards all of it one
                line later (coercing <code>Decimal</code> to <code>float</code>,
                which would round a money column). This is a RECOVERY of
                information we already measured, not an invention.
              </p>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Column</th>
                    <th className="px-3 py-2 text-left">Recovered type (kind)</th>
                    <th className="px-3 py-2 text-left">Source type</th>
                    <th className="px-3 py-2 text-left">Legacy shape</th>
                  </tr>
                </thead>
                <tbody>
                  {outcome.typeLoss.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-4 text-center text-xs text-muted-foreground"
                      >
                        No column on this table carried a recoverable type.
                      </td>
                    </tr>
                  ) : (
                    outcome.typeLoss.map((row) => (
                      <tr key={row.column} className="border-t border-border/40">
                        <td className="px-3 py-1.5 font-mono text-xs">
                          {row.column}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                            {row.recoveredType ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                          {row.sourceType ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">
                          {row.lostBecause}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-1">
              <h2 className="text-sm font-medium text-foreground">
                The legacy payload, verbatim
              </h2>
              <p className="text-xs text-muted-foreground">
                <code className="text-xs">
                  {"{rows, row_count, command}"}
                </code>{" "}
                — {legacyRows.length} rows,{" "}
                <code className="text-xs">command</code> ={" "}
                {outcome.legacy?.command === null ||
                outcome.legacy?.command === undefined
                  ? "null (measured present in 6 of 6 captures and populated in 0 of 6 — no call site anywhere sets it)"
                  : String(outcome.legacy.command)}
                . There is no column list anywhere in it.
              </p>
              <pre className="max-h-96 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-[11px] leading-relaxed">
                {JSON.stringify(outcome.legacy, null, 2)}
              </pre>
            </div>

            <div className="space-y-1">
              <h2 className="text-sm font-medium text-foreground">
                The kind&apos;s declared columns
              </h2>
              <pre className="max-h-96 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-[11px] leading-relaxed">
                {JSON.stringify(columns, null, 2)}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {outcome && int(outcome.result.row_count) === 0 && (
        <p className="text-xs text-muted-foreground">
          Zero rows is a meaningful state, not an error: the table above still
          declares its columns, because &ldquo;the query ran and returned
          nothing&rdquo; is an answer and the legacy shape could not give it —
          an empty legacy result is <code>{"{rows: [], row_count: 0}"}</code>,
          which cannot say what was queried or what the columns were.
        </p>
      )}
    </div>
  );
}
