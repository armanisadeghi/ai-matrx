"use client";

/**
 * MatrixResults — the grid (rows × columns, one cell per run) and the
 * analysis under it: column totals and averages, row totals, the delta vs the
 * first column, and the used-tools / no-tools split with each pair's
 * break-even share.
 */

import { useState } from "react";
import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import { ExternalLink, History, RotateCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Cost } from "@/components/cost/Cost";
import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { canonicalConversationHref } from "@ai-matrx/chat/agents/components/conversation-actions/conversation-verbs";
import {
  avgMetrics,
  breakEven,
  cellMetrics,
  cellStatusLabel,
  unfinishedLabel,
  isBundleLister,
  realToolCalls,
  rowUsedTools,
  spendOf,
  sumMetrics,
  type BreakEven,
  type Metrics,
} from "../model";
import { selectMatrixCells, selectMatrixSetup } from "../redux/selectors";
import type { MatrixCell, MatrixVariant } from "../types";

import { Spinner } from "@/components/ui/loaders/Spinner";
import { Badge, Button } from "@ai-matrx/design-system/controls";
import { formatCount, formatDurationMs, formatPercent, formatPercentFromFraction } from "@ai-matrx/kit/format";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
function tokens(n: number | null | undefined): string {
  if (n == null) return "—";
  // Rounded first: the matrix shows per-run AVERAGES, and a token count is whole.
  return formatCount(Math.round(n), n >= 10_000 ? { style: "compact" } : undefined);
}

/** Total input, then its uncached and cached parts, then output. */
function TokenLine({ m, className }: { m: Metrics; className?: string }) {
  return (
    <span className={cn("type-meta text-muted-foreground tabular-nums", className)}>
      in {tokens(m.inputAll)}
      <span className="text-muted-foreground/70">
        {" "}({tokens(m.input)} new · {tokens(m.cached)} cached)
      </span>
      {" "}· out {tokens(m.output)} · {formatCount(Math.round(m.toolCalls * 10) / 10)} tools
    </span>
  );
}

function pct(a: number, b: number): string {
  if (!b) return "—";
  const d = ((a - b) / b) * 100;
  return `${d > 0 ? "+" : ""}${formatPercent(d, { maxDigits: 1 })}`;
}

export function MatrixResults({
  onRerunCell,
  busy,
}: {
  onRerunCell: (cell: { row_id: string; column_id: string; repeat: number }) => void;
  busy: boolean;
}) {
  const setup = useAppSelector(selectMatrixSetup);
  const cells = useAppSelector(selectMatrixCells);
  const rows = setup.rows.variants;
  const cols = setup.columns.variants;
  const [withHistory, setWithHistory] = useState(false);
  const hasHistory = cells.some((c) => c.history.length > 0);

  const byKey = new Map<string, MatrixCell[]>();
  for (const c of cells) {
    const k = `${c.rowId}|${c.columnId}`;
    const list = byKey.get(k) ?? [];
    list.push(c);
    byKey.set(k, list);
  }
  const cellsAt = (r: MatrixVariant, c: MatrixVariant) =>
    (byKey.get(`${r.id}|${c.id}`) ?? []).sort((a, b) => a.repeat - b.repeat);

  const colCells = cols.map((c) => cells.filter((x) => x.columnId === c.id));
  // Totals are real spend: every current attempt whatever its status, plus
  // earlier attempts when asked. Averages compare completed runs only.
  const colSpend = colCells.map((list) => spendOf(list, withHistory));
  const colUnfinished = colCells.map(unfinishedLabel);
  const colAvgs = colCells.map((list) => avgMetrics(sumMetrics(list.map(cellMetrics))));
  const first = colAvgs[0];

  if (rows.length === 0 || cols.length === 0) {
    return <div className="p-8 text-center type-body text-muted-foreground">Set up rows and columns first</div>;
  }

  return (
    <div className="space-y-4">
      {hasHistory && (
        <div className="flex justify-end">
          <Button variant="outline" pressed={withHistory} icon={<History />} onClick={() => setWithHistory((v) => !v)} title="Count the spend of earlier attempts in the totals">
            Earlier attempts
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full type-secondary border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="sticky left-0 z-10 bg-muted/40 text-left font-semibold px-2 py-2 min-w-48">
                {setup.rows.label} \ {setup.columns.label}
              </th>
              {cols.map((c) => (
                <th key={c.id} className="text-left font-semibold px-2 py-2 min-w-40">
                  {c.label || "—"}
                </th>
              ))}
              <th className="text-right font-semibold px-2 py-2 min-w-28">Row total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rowCells = cells.filter((x) => x.rowId === r.id);
              const rowSum = spendOf(rowCells, withHistory);
              const used = rowUsedTools(rowCells);
              return (
                <tr key={r.id} className="border-b border-border/60 align-top">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-card text-left font-normal px-2 py-1.5 max-w-64"
                    title={r.patch.user_input ?? r.label}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{r.label || "—"}</span>
                      {used != null && (
                        // read-gate-exempt: badge wording from the result's own tool-use flag; nothing is read
                        <Badge tone={used ? "warning" : "neutral"}>{used ? "tools" : "no tools"}</Badge>
                      )}
                    </div>
                  </th>
                  {cols.map((c) => (
                    <td key={c.id} className="px-1 py-1">
                      <CellButton
                        cells={cellsAt(r, c)}
                        rowLabel={r.label}
                        colLabel={c.label}
                        busy={busy}
                        onRerun={(repeat) => onRerunCell({ row_id: r.id, column_id: c.id, repeat })}
                        expectedRepeats={setup.repeats}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {rowSum.n > 0 ? (
                      <>
                        <Cost usd={rowSum.cost} short />
                        <div className="text-muted-foreground">{tokens(rowSum.total)} tok</div>
                        {rowSum.unfinished > 0 && (
                          <div className="text-destructive">{unfinishedLabel(rowCells)}</div>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/30">
            <FootRow
              label={withHistory ? "Total · all attempts" : "Total"}
              values={colSpend.map((s) => (s.n ? s : null))}
              unfinished={colUnfinished}
            />
            <FootRow label="Average · completed" values={colAvgs} />
            <tr className="border-t border-border">
              <th className="sticky left-0 z-10 bg-muted/30 text-left font-semibold px-2 py-1.5">
                Δ vs {cols[0]?.label || "first"}
              </th>
              {colAvgs.map((a, i) => (
                <td key={cols[i].id} className="px-2 py-1.5 tabular-nums">
                  {i === 0 || !a || !first ? (
                    "—"
                  ) : (
                    <span className="flex flex-col">
                      <span className={deltaClass(a.cost, first.cost)}>cost {pct(a.cost, first.cost)}</span>
                      <span className={deltaClass(a.total, first.total)}>tok {pct(a.total, first.total)}</span>
                    </span>
                  )}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <ToolsAnalysis cells={cells} rows={rows} cols={cols} />
    </div>
  );
}

function deltaClass(a: number, b: number): string {
  if (!b || a === b) return "";
  return a < b ? "text-emerald-600" : "text-rose-600";
}

function FootRow({
  label,
  values,
  unfinished,
}: {
  label: string;
  values: (Metrics | null)[];
  unfinished?: string[];
}) {
  return (
    <tr className="border-t border-border">
      <th className="sticky left-0 z-10 bg-muted/30 text-left font-semibold px-2 py-1.5">{label}</th>
      {values.map((m, i) => (
        <td key={i} className="px-2 py-1.5 tabular-nums">
          {m ? (
            <span className="flex flex-col">
              <Cost usd={m.cost} short />
              <TokenLine m={m} />
            </span>
          ) : (
            "—"
          )}
          {unfinished?.[i] && <span className="block text-destructive">{unfinished[i]}</span>}
        </td>
      ))}
      <td />
    </tr>
  );
}

const STATUS_DOT: Record<string, string> = {
  queued: "bg-muted-foreground/40",
  running: "bg-sky-500 animate-pulse",
  completed: "bg-emerald-500",
  failed: "bg-rose-500",
  cancelled: "bg-zinc-400",
  stalled: "bg-amber-500",
  empty: "border border-dashed border-muted-foreground/50",
};

function statusOf(cell: MatrixCell | undefined): string {
  if (!cell) return "empty";
  return cell.stalled ? "stalled" : cell.status;
}

function CellButton({
  cells,
  rowLabel,
  colLabel,
  busy,
  onRerun,
  expectedRepeats,
}: {
  cells: MatrixCell[];
  rowLabel: string;
  colLabel: string;
  busy: boolean;
  onRerun: (repeat: number) => void;
  expectedRepeats: number;
}) {
  const avg = avgMetrics(sumMetrics(cells.map(cellMetrics)));
  // A failed or cancelled run that spent money still shows what it spent.
  const spend = spendOf(cells, false);
  const shown = avg ?? (spend.n > 0 ? spend : null);
  const running = cells.some((c) => c.status === "running" && !c.stalled);
  const failed = cells.some((c) => c.status === "failed" || c.stalled);
  const label = cellStatusLabel(cells);
  const repeats = Array.from({ length: expectedRepeats }, (_, i) => cells.find((c) => c.repeat === i));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full text-left rounded-md px-2 py-1.5 hover:bg-muted transition-colors",
            failed && "bg-rose-500/5",
          )}
          title={`${rowLabel} × ${colLabel}`}
        >
          <div className="flex items-center gap-1.5">
            {repeats.map((c, i) => (
              <span key={i} className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[statusOf(c)])} />
            ))}
            {running && <Spinner size="xs" className="text-muted-foreground" />}
            {!avg && <span className="type-meta text-muted-foreground">{label}</span>}
            {shown && <Cost usd={shown.cost} short className="ml-auto font-medium" />}
          </div>
          {shown && <TokenLine m={shown} className="block mt-0.5" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" width="xl" padding="none">
        <div className="px-3 py-2 border-b border-border type-secondary font-medium truncate">
          {rowLabel} × {colLabel}
        </div>
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-border">
          {repeats.map((c, i) => (
            <CellDetail key={i} cell={c} repeat={i} showRepeat={expectedRepeats > 1} busy={busy} onRerun={() => onRerun(i)} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CellDetail({
  cell,
  repeat,
  showRepeat,
  busy,
  onRerun,
}: {
  cell: MatrixCell | undefined;
  repeat: number;
  showRepeat: boolean;
  busy: boolean;
  onRerun: () => void;
}) {
  const r = cell?.result ?? null;
  const status = statusOf(cell);
  return (
    <div className="px-3 py-2 space-y-1.5 type-secondary">
      <div className="flex items-center gap-2">
        <span className={cn("w-2 h-2 rounded-full", STATUS_DOT[status])} />
        <span className="font-medium capitalize">{status === "empty" ? "Not run" : status}</span>
        {showRepeat && <span className="text-muted-foreground">run {repeat + 1}</span>}
        {cell && cell.attempt > 1 && <span className="text-muted-foreground">attempt {cell.attempt}</span>}
        <div className="flex-1" />
        {cell && (
          <a
            href={canonicalConversationHref(cell.conversationId)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 h-6 px-2 rounded hover:bg-muted text-primary"
            title="Open this cell's conversation in a new tab"
          >
            <ExternalLink className="w-3 h-3" />
            Conversation
          </a>
        )}
        <Button variant="quiet" icon={<RotateCw />} onClick={onRerun} disabled={busy || (!!cell && (cell.status === "running" || cell.status === "queued") && !cell.stalled)} title={cell?.status === "completed" ? "Run this cell again; spends another run" : "Run this cell"}>
          {cell ? "Re-run" : "Run"}
        </Button>
      </div>
      {cell?.error && <div className="text-destructive break-words">{cell.error}<ErrorAlchemyMenu error={cell.error} /></div>}
      {cell?.stalled && <div className="text-warning">Runner stopped responding</div>}
      {r && (
        <>
          <div className="grid grid-cols-4 gap-x-2 gap-y-0.5 tabular-nums">
            <Stat label="Input" value={tokens((r.input_tokens ?? 0) + (r.cached_tokens ?? 0))} />
            <Stat label="Uncached" value={tokens(r.input_tokens)} />
            <Stat label="Cached" value={tokens(r.cached_tokens)} />
            <Stat label="Output" value={tokens(r.output_tokens)} />
            <Stat label="Cost" value={<Cost usd={r.cost ?? null} short />} />
            <Stat label="Tool calls" value={String(r.tool_calls ?? 0)} />
            <Stat label="Real tools" value={String(realToolCalls(r))} />
            <Stat label="LLM calls" value={String(r.llm_calls ?? "—")} />
            <Stat label="Time" value={formatDurationMs(r.duration_ms, { style: "compact" })} />
          </div>
          {r.model && <div className="text-muted-foreground truncate">{r.model}</div>}
          {r.tools_used && r.tools_used.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {r.tools_used.map((t) => (
                <span
                  key={t.name}
                  className={cn(
                    "h-5 px-1.5 rounded type-meta font-mono inline-flex items-center",
                    isBundleLister(t.name) ? "bg-muted text-muted-foreground" : "bg-warning/15 text-warning-ink",
                  )}
                >
                  {t.name} ×{t.count}
                </span>
              ))}
            </div>
          )}
          {r.answer && (
            <div className="max-h-48 overflow-y-auto rounded border border-border bg-muted/30 px-2 py-1.5 break-words"><RichContent source={r.answer ?? ""} level="standard" /></div>
          )}
        </>
      )}
      {cell && cell.history.length > 0 && (
        <div className="pt-1 space-y-0.5">
          <div className="type-meta text-muted-foreground">Earlier attempts</div>
          {[...cell.history].reverse().map((h) => (
            <div key={`${h.attempt}-${h.conversationId}`} className="flex items-center gap-2 tabular-nums">
              <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[h.status])} />
              <span className="text-muted-foreground">#{h.attempt}</span>
              <span className="capitalize">{h.status}</span>
              {h.result && <Cost usd={h.result.cost ?? null} short />}
              {h.result && (
                <span className="text-muted-foreground">
                  in {tokens((h.result.input_tokens ?? 0) + (h.result.cached_tokens ?? 0))}
                </span>
              )}
              {h.conversationId && (
                <a
                  href={canonicalConversationHref(h.conversationId)}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-primary hover:underline"
                  title="Open this attempt's conversation in a new tab"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="type-meta text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Used tools vs no tools
// ---------------------------------------------------------------------------

function ToolsAnalysis({
  cells,
  rows,
  cols,
}: {
  cells: MatrixCell[];
  rows: MatrixVariant[];
  cols: MatrixVariant[];
}) {
  const classified = rows.map((r) => ({
    row: r,
    used: rowUsedTools(cells.filter((c) => c.rowId === r.id)),
  }));
  const toolRows = new Set(classified.filter((x) => x.used === true).map((x) => x.row.id));
  const noToolRows = new Set(classified.filter((x) => x.used === false).map((x) => x.row.id));
  if (toolRows.size + noToolRows.size === 0) return null;

  const stats = cols.map((c) => {
    const inCol = cells.filter((x) => x.columnId === c.id);
    const tools = avgMetrics(sumMetrics(inCol.filter((x) => toolRows.has(x.rowId)).map(cellMetrics)));
    const none = avgMetrics(sumMetrics(inCol.filter((x) => noToolRows.has(x.rowId)).map(cellMetrics)));
    return { col: c, tools, none };
  });

  const pairs: { a: number; b: number }[] = [];
  for (let a = 0; a < cols.length; a += 1) {
    for (let b = a + 1; b < cols.length; b += 1) pairs.push({ a, b });
  }
  const share = toolRows.size / (toolRows.size + noToolRows.size);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-border bg-card overflow-x-auto">
        <header className="flex items-center gap-2 h-9 px-3 border-b border-border type-secondary">
          <span className="font-semibold">Tools vs no tools</span>
          <span className="text-muted-foreground tabular-nums">
            {toolRows.size} of {toolRows.size + noToolRows.size} rows used tools ({formatPercentFromFraction(share)})
          </span>
        </header>
        <table className="w-full type-secondary">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left font-medium px-3 py-1.5">{cols.length ? "Column" : ""}</th>
              <th className="text-right font-medium px-2 py-1.5">Cost · tools</th>
              <th className="text-right font-medium px-2 py-1.5">Cost · none</th>
              <th className="text-right font-medium px-2 py-1.5">Input · tools</th>
              <th className="text-right font-medium px-2 py-1.5">Input · none</th>
              <th className="text-right font-medium px-2 py-1.5">Output · tools</th>
              <th className="text-right font-medium px-3 py-1.5">Output · none</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.col.id} className="border-b border-border/60 tabular-nums">
                <td className="px-3 py-1.5 font-medium truncate max-w-40">{s.col.label || "—"}</td>
                <td className="px-2 py-1.5 text-right">{s.tools ? <Cost usd={s.tools.cost} short /> : "—"}</td>
                <td className="px-2 py-1.5 text-right">{s.none ? <Cost usd={s.none.cost} short /> : "—"}</td>
                <td className="px-2 py-1.5 text-right"><InputCell m={s.tools} /></td>
                <td className="px-2 py-1.5 text-right"><InputCell m={s.none} /></td>
                <td className="px-2 py-1.5 text-right">{s.tools ? tokens(s.tools.output) : "—"}</td>
                <td className="px-3 py-1.5 text-right">{s.none ? tokens(s.none.output) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {pairs.length > 0 && (
        <section className="rounded-lg border border-border bg-card overflow-x-auto">
          <header className="flex items-center h-9 px-3 border-b border-border type-secondary font-semibold">
            Break-even share of tool rows
          </header>
          <table className="w-full type-secondary">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left font-medium px-3 py-1.5">Pair</th>
                <th className="text-left font-medium px-2 py-1.5">By cost</th>
                <th className="text-left font-medium px-3 py-1.5" title="Input (cached included) plus output, so cache warmth does not move it">
                  By all tokens
                </th>
              </tr>
            </thead>
            <tbody>
              {pairs.map(({ a, b }) => {
                const A = stats[a];
                const B = stats[b];
                const names = { a: A.col.label || `#${a + 1}`, b: B.col.label || `#${b + 1}` };
                const byCost = breakEven(
                  { tools: A.tools?.cost ?? null, none: A.none?.cost ?? null },
                  { tools: B.tools?.cost ?? null, none: B.none?.cost ?? null },
                );
                const byTokens = breakEven(
                  { tools: A.tools?.total ?? null, none: A.none?.total ?? null },
                  { tools: B.tools?.total ?? null, none: B.none?.total ?? null },
                );
                return (
                  <tr key={`${a}-${b}`} className="border-b border-border/60">
                    <td className="px-3 py-1.5 font-medium truncate max-w-48">
                      {names.a} vs {names.b}
                    </td>
                    <td className="px-2 py-1.5">
                      <BreakEvenText be={byCost} names={names} />
                    </td>
                    <td className="px-3 py-1.5">
                      <BreakEvenText be={byTokens} names={names} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function InputCell({ m }: { m: Metrics | null }) {
  if (!m) return <>—</>;
  return (
    <span className="flex flex-col items-end" title={`${tokens(m.input)} uncached + ${tokens(m.cached)} cached`}>
      <span>{tokens(m.inputAll)}</span>
      <span className="type-meta text-muted-foreground">
        {tokens(m.input)} new · {tokens(m.cached)} cached
      </span>
    </span>
  );
}

function BreakEvenText({ be, names }: { be: BreakEven; names: { a: string; b: string } }) {
  if (be.kind === "unknown") {
    return <span className="text-muted-foreground" title="Needs tool rows and no-tool rows in both columns">—</span>;
  }
  if (be.kind === "always") {
    if (be.cheaper === "tie") return <span>Equal</span>;
    return (
      <span>
        <span className="font-medium">{names[be.cheaper]}</span> always cheaper
      </span>
    );
  }
  const below = names[be.cheaperBelow];
  const above = be.cheaperBelow === "a" ? names.b : names.a;
  return (
    <span title={`Below ${formatPercentFromFraction(be.p)} tool rows ${below} is cheaper; above it ${above} is`}>
      <span className="font-semibold tabular-nums">{formatPercentFromFraction(be.p)}</span>
      <span className="text-muted-foreground"> · {below} below</span>
    </span>
  );
}
