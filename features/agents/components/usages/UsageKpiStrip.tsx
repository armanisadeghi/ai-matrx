/**
 * UsageKpiStrip — every dimension we watch, with its count, INCLUDING ZERO.
 *
 * The strip answers "what do we know?" and "what do we not?" at one glance: a
 * dimension that reads 0 was checked and is empty; a dimension that is still
 * loading says so; one whose read failed says that, never 0. Clicking a tile
 * filters the table to that dimension; clicking it again clears the filter.
 *
 * The last tile is history — conversations and runs this agent appeared in —
 * context only, never drift-checked, so it never carries a flag count.
 */

"use client";

import { useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { fetchUsageHistoryCounts } from "@/features/agents/redux/usages/usages.thunks";
import type { AgentUsageHistoryCount } from "@/features/agents/redux/usages/usages.types";
import { DIMENSION_ORDER, HISTORY_TILE, dimensionMeta, type UsageDimension } from "./dimensions";
import type { DimensionCount } from "./unified-rows";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export type DimensionReadState = "loading" | "failed" | "ready";

export type HistoryState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; counts: AgentUsageHistoryCount[] };

interface UsageKpiStripProps {
  history: HistoryState;
  counts: Record<UsageDimension, DimensionCount>;
  /** Per-dimension read state — mandates and the scan load separately. */
  readState: (dimension: UsageDimension) => DimensionReadState;
  active: UsageDimension | "history" | null;
  onActiveChange: (next: UsageDimension | "history" | null) => void;
}

const HISTORY_SOURCE_LABEL: Record<string, string> = {
  conversations: "conversations",
  requests: "runs",
  messages: "messages",
  workflow_runs: "workflow runs",
  research: "research items",
  page_extractions: "page extractions",
  context_access: "context accesses",
  errors: "recorded errors",
};

export function historySummary(counts: readonly AgentUsageHistoryCount[]): string {
  const nonZero = counts.filter((count) => count.total > 0);
  if (nonZero.length === 0) return "No conversations or runs recorded.";
  return nonZero
    .map((count) => `${count.total.toLocaleString()} ${HISTORY_SOURCE_LABEL[count.source] ?? count.source}`)
    .join(" · ");
}

export function useHistoryCounts(agentId: string) {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    dispatch(fetchUsageHistoryCounts({ agentId }))
      .unwrap()
      .then((counts) => {
        if (!cancelled) setState({ status: "ready", counts });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, dispatch]);
  return state;
}

export function UsageKpiStrip({
  history,
  counts,
  readState,
  active,
  onActiveChange,
}: UsageKpiStripProps) {
  const historyTotal =
    history.status === "ready"
      ? history.counts.reduce((sum, count) => sum + count.total, 0)
      : null;

  return (
    <div
      className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/20 px-3 py-1.5"
      role="group"
      aria-label="Usage dimensions"
    >
      {DIMENSION_ORDER.map((dimension) => {
        const meta = dimensionMeta(dimension);
        const state = readState(dimension);
        const count = counts[dimension];
        const Icon = meta.icon;
        const selected = active === dimension;
        return (
          <button
            key={dimension}
            type="button"
            onClick={() => onActiveChange(selected ? null : dimension)}
            aria-pressed={selected}
            title={
              state === "failed"
                ? `${meta.plural}: the read failed, so this count is unknown — not zero.`
                : state === "loading"
                  ? `${meta.plural}: loading…`
                  : `${count.total} ${count.total === 1 ? meta.label.toLowerCase() : meta.plural.toLowerCase()}` +
                    (count.flagged > 0 ? ` · ${count.flagged} flagged` : "") +
                    (count.behind > 0 ? ` · ${count.behind} behind the newest version` : "")
            }
            className={cn(
              "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs transition-colors",
              selected
                ? "border-primary bg-primary/10 text-foreground"
                : state === "ready" && count.total === 0
                  ? "border-border/60 bg-transparent text-muted-foreground/70 hover:bg-accent/40"
                  : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent/40",
            )}
          >
            <Icon className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
            <span>{meta.plural}</span>
            {state === "loading" ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-label="loading" />
            ) : state === "failed" ? (
              <span className="font-semibold text-destructive">? <ErrorAlchemyMenu /></span>
            ) : (
              <span className="font-semibold tabular-nums">{count.total}</span>
            )}
            {state === "ready" && count.flagged > 0 ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/10 px-1.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                <TriangleAlert className="h-2.5 w-2.5" aria-hidden />
                {count.flagged}
              </span>
            ) : state === "ready" && count.behind > 0 ? (
              <span className="rounded-full bg-amber-500/10 px-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                {count.behind} behind
              </span>
            ) : null}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onActiveChange(active === "history" ? null : "history")}
        aria-pressed={active === "history"}
        title={
          history.status === "ready"
            ? `${historySummary(history.counts)} — context only, not drift-checked.`
            : history.status === "failed"
              ? "History: the read failed, so this count is unknown."
              : "History: loading…"
        }
        className={cn(
          "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border border-dashed px-2 text-xs text-muted-foreground transition-colors",
          active === "history"
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border/60 hover:bg-accent/40",
        )}
      >
        <HISTORY_TILE.icon className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
        <span>{HISTORY_TILE.label}</span>
        {history.status === "loading" ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-label="loading" />
        ) : history.status === "failed" ? (
          <span className="font-semibold text-destructive">? <ErrorAlchemyMenu /></span>
        ) : (
          <span className="font-semibold tabular-nums">{historyTotal}</span>
        )}
      </button>
    </div>
  );
}

/** The history detail line, shown when the history tile is active. */
export function HistoryDetail({ history }: { history: HistoryState }) {
  return (
    <p className="border-b border-border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
      {history.status === "loading"
        ? "Loading history…"
        : history.status === "failed"
          ? "The history read failed."
          : historySummary(history.counts)}{" "}
      <span className="opacity-70">Context only — these are past runs, not places the agent will run again, so they are never drift-checked.</span>
    </p>
  );
}
