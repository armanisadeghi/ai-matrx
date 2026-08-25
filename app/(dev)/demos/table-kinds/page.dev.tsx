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
 * ── WHAT THE 2026-08-25 REVIEW CHANGED, AND WHY (Arman, verbatim) ───────────
 *
 * > "anything that hides data from a user is just trash. Throw it away… you
 * > have data, and it says you're showing the first five rows. Okay. Well, if
 * > all you're gonna show is the first five rows, then the rest of it's just
 * > trash… Imagine if you use Google search and Google shows you the first
 * > three results and then says, well, we have three hundred more, but we're
 * > not gonna show them to you."
 *
 * > "I don't even know what the purpose of the table is, so I don't know what
 * > kind of data it's showing."
 *
 * Both were defects OF THIS PAGE, not of the component:
 *
 * 1. THE DEMO'S DEFAULT STATE IS A CLAIM ABOUT THE COMPONENT. This page used
 *    to default `limit` to **5** — it FETCHED five rows so the truncation
 *    banner would be on screen. Every reviewer therefore met the table for the
 *    first time in its degraded state, showing five rows of a 75-row table with
 *    the rest genuinely absent from the client. The default is now the whole
 *    table, and the cut-off state is a button a reviewer presses on purpose.
 * 2. A TRUNCATED READ NOW HAS A WAY OUT. `DataTableMoreProvider` hands the
 *    renderer this page's own re-read, so the banner's button actually
 *    refetches. The endpoint's own 100-row ceiling is stated in the banner
 *    rather than discovered.
 * 3. IT SAYS WHAT YOU ARE LOOKING AT, in the first two lines, in plain words.
 * 4. NO BOX IN A BOX (LAW 3c): the kind renders `variant="bare"` because
 *    `DataTableBlock` already draws its own border, header and padding.
 *
 * TWO TABS:
 *
 *  1. TABLE — the typed rendering of a real read.
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
import { AlertTriangle, Play, Scissors, ScanSearch, Table2 } from "lucide-react";
import { useBackendApi } from "@/hooks/useBackendApi";
import { consumeStream } from "@/lib/api/stream-parser";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { DataTableMoreProvider } from "@/components/mardown-display/blocks/table-kinds/data-table-more";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";

/** The endpoint's own ceiling (`TableKindsRequest.limit`, `ge=1 le=100`). */
const ENDPOINT_ROW_CEILING = 100;
/** The default: the whole of the sample table, not a slice of it. */
const DEFAULT_LIMIT = String(ENDPOINT_ROW_CEILING);
/** What the "show me a cut-off read" button asks for. */
const TRUNCATION_DEMO_LIMIT = 5;

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
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** True while the truncation banner's own "get the rest" button is working. */
  const [fetchingMore, setFetchingMore] = useState(false);

  /**
   * ONE read path. Everything — the form, the truncation demo button and the
   * renderer's "get the rest" control — goes through here, so there is no
   * second way to fetch that could drift from this one.
   */
  const read = async (requestedLimit: number, tableName: string) => {
    const response = await post("/table-kinds/read", {
      table: tableName.trim(),
      limit: Math.max(1, Math.min(ENDPOINT_ROW_CEILING, requestedLimit)),
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
    return received;
  };

  const run = async (requestedLimit?: number) => {
    if (phase === "running") return;
    const parsedLimit = requestedLimit ?? Number(limit);
    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > ENDPOINT_ROW_CEILING
    ) {
      toast.error(
        `Row count must be a whole number between 1 and ${ENDPOINT_ROW_CEILING}.`,
      );
      return;
    }
    setPhase("running");
    setOutcome(null);
    try {
      setOutcome(await read(parsedLimit, table));
      setPhase("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The read failed.");
      setPhase(outcome ? "done" : "idle");
    }
  };

  /** The renderer's truncation banner asked for the rest. Go and get it. */
  const requestMore = async ({ total }: { have: number; total: number | null }) => {
    if (fetchingMore) return;
    setFetchingMore(true);
    try {
      const want = Math.min(total ?? ENDPOINT_ROW_CEILING, ENDPOINT_ROW_CEILING);
      const next = await read(want, table);
      setOutcome(next);
      setLimit(String(want));
      const stillShort = total !== null && total > ENDPOINT_ROW_CEILING;
      toast.success(
        stillShort
          ? `Loaded ${want} rows — this endpoint reads at most ${ENDPOINT_ROW_CEILING} at a time.`
          : "Loaded the whole table.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load the rest of the table.",
      );
    } finally {
      setFetchingMore(false);
    }
  };

  const showTruncated = () => {
    setLimit(String(TRUNCATION_DEMO_LIMIT));
    void run(TRUNCATION_DEMO_LIMIT);
  };

  const columns = outcome ? kindColumns(outcome.result) : [];
  const typedColumns = columns.filter((column) => str(column.type) !== null).length;
  const legacyRows = Array.isArray(outcome?.legacy?.rows) ? outcome.legacy.rows : [];
  const truncated = outcome?.result.truncated === true;
  const totalRowCount = outcome ? int(outcome.result.total_row_count) : null;
  const rowCount = outcome ? (int(outcome.result.row_count) ?? 0) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      {/* ── WHAT AM I LOOKING AT? The first thing on the page. ───────────── */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Tables — live demo
        </h1>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">
            Everything below is a real table out of this platform&rsquo;s own
            database, read live, right now.
          </strong>{" "}
          Type a table name, press Read, and you get its actual rows — the same
          rows the AI reads when it queries that table for you. A spreadsheet
          you upload, a table lifted out of a PDF, a set of search results and a
          database query are all the same thing to us, so they all arrive in one
          shape and are drawn by one component. That component is what this page
          exists to show you.
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
            Which table? (schema.name — try{" "}
            <code className="text-[11px]">seo.serp_opportunity</code>)
          </span>
          <Input
            value={table}
            onChange={(e) => setTable(e.target.value)}
            placeholder="seo.serp_opportunity"
          />
        </label>
        <label className="flex w-36 flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            Rows to read (max {ENDPOINT_ROW_CEILING})
          </span>
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

      {/* ── The degraded state is now something you ASK for ──────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <Scissors className="h-3.5 w-3.5 shrink-0" />
        <span>
          Want to see what happens when a read gets cut off before it finishes?
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          disabled={phase === "running"}
          onClick={showTruncated}
        >
          Read only {TRUNCATION_DEMO_LIMIT} rows
        </Button>
        <span>
          The table says so out loud <em>and</em> gives you a button that goes
          and gets the rest — a warning with no way out is just data we took
          away from you.
        </span>
      </div>

      {phase === "running" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Reading the table…
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
            {/* THE SEAM: the renderer's truncation banner can now reach this
                page's own read. LAW 3 — the cap belongs to the renderer, and
                when the FETCH capped, the surface must be able to ask for
                more. */}
            <DataTableMoreProvider
              value={{
                onRequestMore: requestMore,
                pending: fetchingMore,
                // The button may only promise what this endpoint can deliver.
                moreLabel:
                  totalRowCount !== null && totalRowCount > ENDPOINT_ROW_CEILING
                    ? `Get ${ENDPOINT_ROW_CEILING} rows`
                    : null,
                limitNote:
                  totalRowCount !== null && totalRowCount > ENDPOINT_ROW_CEILING
                    ? `This demo endpoint reads at most ${ENDPOINT_ROW_CEILING} rows per request.`
                    : null,
              }}
            >
              {/* bare: DataTableBlock IS the chrome — never a card around it */}
              <KindInstanceRender
                kind="data_table"
                value={outcome.result}
                variant="bare"
                showRoutingNote
              />
            </DataTableMoreProvider>
            <p className="text-xs text-muted-foreground">
              {`This read brought back ${rowCount.toLocaleString()} ${
                rowCount === 1 ? "row" : "rows"
              }, and ${typedColumns} of ${columns.length} ${
                columns.length === 1 ? "column" : "columns"
              } arrived knowing what kind of thing they hold. `}
              A column that does NOT know renders differently on purpose —
              &ldquo;we don&rsquo;t know what this is&rdquo; is not the same as
              &ldquo;this is text&rdquo;, and nothing in an unknown column is
              guessed at. Guessing is how a ZIP code loses its leading zero.
              {truncated
                ? " This read was cut off — the table says so, and the button in that warning goes and gets the rest."
                : " Nothing was cut off: every row this table has is on the page, and the ones below the fold are one click away."}
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

      {outcome && rowCount === 0 && (
        <p className="text-xs text-muted-foreground">
          Zero rows is a real answer, not an error: the table above still shows
          its columns, because &ldquo;we looked, and there is nothing in
          here&rdquo; is something you needed to be told.
        </p>
      )}
    </div>
  );
}
