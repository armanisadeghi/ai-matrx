"use client";

/**
 * ModelContextPanel — "what is the model actually seeing right now?"
 *
 * Lives in the Creator Panel's Model Context tab (CreatorRunPanel.tsx).
 * Keyed to the DISPLAY conversation id (where the just-completed request
 * landed), same as RequestStatsPanel / SessionStatsPanel / ClientMetricsPanel.
 *
 * Data sources:
 *   - context-state.slice — populated by CONTEXT_STATE / CONTEXT_TRIMMED
 *     stream events emitted from matrx_ai.db.persistence.
 *   - fetchContextState thunk — cold-start hydration on conversation open
 *     (GET /cx/conversations/{id}/context-state).
 *
 * Sections (top to bottom):
 *   1. Live fill strip — % full, est tokens, last request usage triple,
 *      cache "alive" indicator with countdown.
 *   2. What just happened — TrimSummary detail (or "no trim this turn").
 *   3. Raw provider usage — collapsible JSON of the last raw_usage block.
 */

import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchContextState } from "@/lib/api/context-api";
import {
  selectContextState,
  selectEstimatedTokens,
  selectContextFillRatio,
  selectCacheLikelyAlive,
  selectCacheSecondsRemaining,
  selectLastTrimSummary,
  selectLastRawUsage,
  DEFAULT_CONTEXT_WINDOW_TOKENS,
} from "@/features/agents/redux/execution-system/context-state/context-state.selectors";
import { EmptyStats, StatRow, StatSection, fmtTokens } from "./shared";
import { cn } from "@/lib/utils";

export interface ModelContextPanelProps {
  conversationId: string;
}

export function ModelContextPanel({ conversationId }: ModelContextPanelProps) {
  const dispatch = useAppDispatch();

  const stateSelector = useMemo(
    () => selectContextState(conversationId),
    [conversationId],
  );
  const estSelector = useMemo(
    () => selectEstimatedTokens(conversationId),
    [conversationId],
  );
  const fillSelector = useMemo(
    () => selectContextFillRatio(conversationId),
    [conversationId],
  );
  const cacheAliveSelector = useMemo(
    () => selectCacheLikelyAlive(conversationId),
    [conversationId],
  );
  const cacheSecsSelector = useMemo(
    () => selectCacheSecondsRemaining(conversationId),
    [conversationId],
  );
  const trimSelector = useMemo(
    () => selectLastTrimSummary(conversationId),
    [conversationId],
  );
  const rawUsageSelector = useMemo(
    () => selectLastRawUsage(conversationId),
    [conversationId],
  );

  const state = useAppSelector(stateSelector);
  const estTokens = useAppSelector(estSelector);
  const fillRatio = useAppSelector(fillSelector);
  const cacheAlive = useAppSelector(cacheAliveSelector);
  const cacheSecs = useAppSelector(cacheSecsSelector);
  const trim = useAppSelector(trimSelector);
  const rawUsage = useAppSelector(rawUsageSelector);

  // Cold-start hydration — fetch the snapshot on conversation change. Stream
  // events keep the slice fresh after this, so this only fires once per
  // conversation switch.
  useEffect(() => {
    const controller = new AbortController();
    dispatch(fetchContextState({ conversationId, signal: controller.signal }));
    return () => controller.abort();
  }, [conversationId, dispatch]);

  if (!state) {
    return (
      <EmptyStats text="No context measurements yet. Fire a turn to populate." />
    );
  }

  const fillPct = Math.round(fillRatio * 100);
  const fillTone =
    fillRatio < 0.6 ? "text-emerald-500" : fillRatio < 0.85 ? "text-amber-500" : "text-rose-500";
  const fillBar =
    fillRatio < 0.6
      ? "bg-emerald-500"
      : fillRatio < 0.85
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <div className="px-3 py-2 grid grid-cols-1 gap-y-3 overflow-y-auto h-full">
      {/* ── Live fill strip ──────────────────────────────────────────── */}
      <StatSection title="Now">
        <div className="flex items-center justify-between text-[11px]">
          <span className={cn("font-mono tabular-nums", fillTone)}>
            {fillPct}% full
          </span>
          <span className="font-mono tabular-nums text-muted-foreground">
            {fmtTokens(estTokens)} / {fmtTokens(DEFAULT_CONTEXT_WINDOW_TOKENS)}{" "}
            est tokens
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full transition-all duration-300", fillBar)}
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <StatRow
          label="Last request"
          value={`${fmtTokens(state.lastRequestInputTokens)} in · ${fmtTokens(
            state.lastRequestCachedTokens,
          )} cached · ${fmtTokens(state.lastRequestOutputTokens)} out`}
        />
        <StatRow
          label="Visible to model"
          value={`${fmtTokens(state.totalCharsVisibleToModel)} chars · ${
            state.messageCountVisible
          } messages`}
        />
        <StatRow
          label="Cache"
          value={
            cacheAlive
              ? `alive (${formatSecs(cacheSecs)} left)`
              : "expired / unknown"
          }
          valueClassName={cacheAlive ? "text-emerald-500" : "text-muted-foreground"}
        />
        {state.measuredAt && (
          <StatRow
            label="Measured at"
            value={new Date(state.measuredAt).toLocaleTimeString()}
            valueClassName="text-muted-foreground"
          />
        )}
      </StatSection>

      {/* ── What just happened (TrimSummary) ─────────────────────────── */}
      <StatSection title="What just happened">
        {trim ? <TrimSummaryView trim={trim} /> : (
          <p className="text-[11px] text-muted-foreground/80">
            No trim activity recorded for this turn.
          </p>
        )}
      </StatSection>

      {/* ── Raw provider usage ───────────────────────────────────────── */}
      <StatSection title="Raw provider usage">
        {rawUsage && Object.keys(rawUsage).length > 0 ? (
          <pre className="text-[10px] leading-snug bg-muted/40 rounded p-2 overflow-x-auto font-mono">
            {JSON.stringify(rawUsage, null, 2)}
          </pre>
        ) : (
          <p className="text-[11px] text-muted-foreground/80">
            No raw provider usage available — try a turn that returns a real
            response.
          </p>
        )}
      </StatSection>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface TrimSummaryViewProps {
  trim: NonNullable<ReturnType<typeof selectLastTrimSummary> extends (...a: never) => infer R ? R : never>;
}

function TrimSummaryView({ trim }: TrimSummaryViewProps) {
  if (!trim) return null;
  const skipped = trim.eligible_but_skipped_reason;
  const rewrittenCount = trim.blocks_rewritten ?? 0;
  const freed = trim.freed_chars ?? 0;
  const rewrittenBlocks = trim.rewritten_blocks ?? [];
  return (
    <>
      <StatRow
        label="Outcome"
        value={
          skipped
            ? `skipped (${skipped})`
            : `${rewrittenCount} block(s) rewritten`
        }
        valueClassName={
          skipped
            ? "text-amber-500"
            : rewrittenCount > 0
              ? "text-emerald-500"
              : "text-muted-foreground"
        }
      />
      {rewrittenCount > 0 && (
        <StatRow label="Freed" value={`${freed.toLocaleString()} chars`} />
      )}
      {rewrittenBlocks.length > 0 && (
        <div className="text-[10px] font-mono text-muted-foreground space-y-0.5 mt-1">
          {rewrittenBlocks.slice(0, 8).map((b) => (
            <div key={`${b.message_position}:${b.call_id}`} className="truncate">
              pos {b.message_position} · {b.tool_name} ({b.tier}) ·{" "}
              {b.before_chars.toLocaleString()} → {b.after_chars.toLocaleString()}
            </div>
          ))}
          {rewrittenBlocks.length > 8 && (
            <div className="italic">…and {rewrittenBlocks.length - 8} more</div>
          )}
        </div>
      )}
      {skipped === "cache_protect" && (
        <p className="text-[10px] text-muted-foreground/80 mt-1">
          Trim was eligible but skipped to protect the live cache prefix.
          Will fire on the next turn that crosses the 5K-token savings floor
          or once the cache window expires.
        </p>
      )}
    </>
  );
}

function formatSecs(secs: number): string {
  if (secs <= 0) return "expired";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}m${s}s` : `${m}m`;
}
