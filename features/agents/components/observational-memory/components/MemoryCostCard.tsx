"use client";

/**
 * MemoryCostCard
 *
 * Two-tier cost view:
 *   1. Authoritative totals from GET /conversations/:id/memory_cost
 *      (summed across every memory event persisted in
 *      cx_observational_memory_event).
 *   2. Local running counters from the live stream events (fast feedback
 *      while a turn is in flight — useful because the REST endpoint is only
 *      refreshed on demand).
 *
 * Also breaks down cost + tokens by event type so it's obvious when the
 * Reflector (compression) costs more than the Observer, and vice versa.
 */

import React, { useCallback, useEffect } from "react";
import { DollarSign, RefreshCw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectMemoryCostFetchState,
  selectMemoryCostSummary,
  selectMemoryCounters,
} from "@/features/agents/redux/execution-system/observational-memory/observational-memory.selectors";
import { fetchMemoryCost } from "@/features/agents/redux/execution-system/observational-memory/fetch-memory-cost.thunk";
import { formatCostUsd, formatTokens } from "./format";
import type { components } from "@/types/python-generated/api-types";

type MemoryCostByEventType = components["schemas"]["MemoryCostByEventType"];

const EMPTY_BREAKDOWN_ROW: MemoryCostByEventType = {
  count: 0,
  cost: 0,
  input_tokens: 0,
  output_tokens: 0,
};

interface MemoryCostCardProps {
  conversationId: string;
  /** Auto-fetch the cost summary on mount. */
  autoFetch?: boolean;
  className?: string;
}

export function MemoryCostCard({
  conversationId,
  autoFetch = true,
  className,
}: MemoryCostCardProps) {
  const dispatch = useAppDispatch();
  const summary = useAppSelector(selectMemoryCostSummary(conversationId));
  const fetchState = useAppSelector(selectMemoryCostFetchState(conversationId));
  const counters = useAppSelector(selectMemoryCounters(conversationId));

  const isLoading = fetchState?.status === "loading";

  const handleRefresh = useCallback(() => {
    dispatch(fetchMemoryCost({ conversationId }));
  }, [dispatch, conversationId]);

  useEffect(() => {
    if (!autoFetch) return;
    if (fetchState?.status === "loading") return;
    if (fetchState?.status === "success") return;
    dispatch(fetchMemoryCost({ conversationId }));
  }, [conversationId, autoFetch, dispatch]);

  const breakdown = summary?.by_event_type ?? {};
  const breakdownKeys = Object.keys(breakdown).sort();

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card/60 p-3 space-y-3",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-amber-500/10 text-amber-500">
          <DollarSign className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
            Memory Cost (infrastructure)
          </div>
          <div className="text-xs text-muted-foreground truncate">
            Admin-only. Not included in conversation total_cost.
          </div>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-1 h-6 px-1.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          title="Refresh from DB"
        >
          <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {fetchState?.status === "error" && (
        <div className="text-[11px] bg-destructive/5 border border-destructive/20 text-destructive rounded p-2">
          {fetchState.error ?? "Failed to load memory cost."}
        </div>
      )}

      {/* Authoritative totals */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1.5">
          Server rollup {summary ? "" : "(not loaded)"}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <CostStat
            label="Total"
            value={formatCostUsd(summary?.total_cost)}
            tone="emerald"
          />
          <CostStat
            label="Events"
            value={
              summary?.event_count != null ? String(summary.event_count) : "—"
            }
          />
          <CostStat
            label="Input tokens"
            value={formatTokens(summary?.total_input_tokens)}
          />
          <CostStat
            label="Output tokens"
            value={formatTokens(summary?.total_output_tokens)}
          />
        </div>
      </div>

      {/* Live local counters */}
      {counters && counters.totalEvents > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1.5 flex items-center gap-1">
            <Zap className="w-3 h-3 text-blue-500" />
            Live this session
          </div>
          <div className="grid grid-cols-4 gap-2">
            <CostStat
              label="Total"
              value={formatCostUsd(counters.totalCost)}
              tone="blue"
            />
            <CostStat label="Events" value={String(counters.totalEvents)} />
            <CostStat
              label="Input tokens"
              value={formatTokens(counters.totalInputTokens)}
            />
            <CostStat
              label="Output tokens"
              value={formatTokens(counters.totalOutputTokens)}
            />
          </div>
        </div>
      )}

      {/* Per-event-type breakdown */}
      {breakdownKeys.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1">
            Breakdown by event type
          </div>
          <div className="rounded border border-border/60 overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-2 py-1">Type</th>
                  <th className="text-right font-medium px-2 py-1">Count</th>
                  <th className="text-right font-medium px-2 py-1">Cost</th>
                  <th className="text-right font-medium px-2 py-1">In</th>
                  <th className="text-right font-medium px-2 py-1">Out</th>
                </tr>
              </thead>
              <tbody>
                {breakdownKeys.map((key) => {
                  const row: MemoryCostByEventType =
                    breakdown[key] ?? EMPTY_BREAKDOWN_ROW;
                  const count = toNum(row.count);
                  const cost = toNum(row.cost);
                  const inTokens = toNum(row.input_tokens);
                  const outTokens = toNum(row.output_tokens);
                  return (
                    <tr
                      key={key}
                      className="border-t border-border/40 hover:bg-muted/20"
                    >
                      <td className="px-2 py-1 font-mono">{key}</td>
                      <td className="px-2 py-1 text-right font-mono">
                        {count ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-foreground">
                        {formatCostUsd(cost, 5)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                        {formatTokens(inTokens)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                        {formatTokens(outTokens)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** Coerce an unknown JSON value (from the openapi `{ [k]: unknown }` map) to
 *  a finite number, or null when it isn't representable. */
function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function CostStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "blue";
}) {
  return (
    <div className="rounded border border-border/60 bg-muted/10 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 truncate">
        {label}
      </div>
      <div
        className={cn(
          "text-xs font-mono font-medium truncate",
          tone === "emerald" && "text-emerald-500",
          tone === "blue" && "text-blue-500",
          !tone && "text-foreground",
        )}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
