"use client";

/**
 * ContextGaugeWidget — always-on header badge showing "how full is the model's context?"
 *
 * Compact pill rendered in ChatHeaderControls between the admin toggles and
 * the share button. Reads from the context-state slice (no separate data
 * fetching here — the slice is populated by stream events and the cold-start
 * hydration that runs when the Model Context tab opens).
 *
 * Click → expands the Creator Panel AND switches to the `model_context` tab.
 * The signalling is a window-level CustomEvent (``matrx:openCreatorTab``) so
 * we don't have to lift CreatorRunPanel's local expand/tab state into Redux
 * for a one-shot interaction.
 *
 * Color tiers: green < 60% < amber < 85% < rose.
 */

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectContextState,
  selectContextFillRatio,
  selectEstimatedTokens,
  DEFAULT_CONTEXT_WINDOW_TOKENS,
} from "@/features/agents/redux/execution-system/context-state/context-state.selectors";
import { cn } from "@/lib/utils";

export interface ContextGaugeWidgetProps {
  /** The conversation whose context we're gauging. */
  conversationId: string;
  /** Optional context-window ceiling override (defaults to a conservative 200k). */
  windowTokens?: number;
}

export function ContextGaugeWidget({
  conversationId,
  windowTokens = DEFAULT_CONTEXT_WINDOW_TOKENS,
}: ContextGaugeWidgetProps) {
  const stateSelector = useMemo(
    () => selectContextState(conversationId),
    [conversationId],
  );
  const fillSelector = useMemo(
    () => selectContextFillRatio(conversationId, windowTokens),
    [conversationId, windowTokens],
  );
  const estSelector = useMemo(
    () => selectEstimatedTokens(conversationId),
    [conversationId],
  );

  const state = useAppSelector(stateSelector);
  const ratio = useAppSelector(fillSelector);
  const est = useAppSelector(estSelector);

  // Never render until we have a measurement — first-time conversations
  // would otherwise show "0% / 200K" which is misleading.
  if (!state || state.measuredAt === null) {
    return null;
  }

  const pct = Math.round(ratio * 100);
  const tone =
    ratio < 0.6
      ? {
          text: "text-emerald-600 dark:text-emerald-400",
          bg: "bg-emerald-500/10 border-emerald-500/30",
          bar: "bg-emerald-500",
        }
      : ratio < 0.85
        ? {
            text: "text-amber-600 dark:text-amber-400",
            bg: "bg-amber-500/10 border-amber-500/30",
            bar: "bg-amber-500",
          }
        : {
            text: "text-rose-600 dark:text-rose-400",
            bg: "bg-rose-500/10 border-rose-500/30",
            bar: "bg-rose-500",
          };

  const openModelContext = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("matrx:openCreatorTab", {
        detail: { tab: "model_context", conversationId },
      }),
    );
  };

  return (
    <button
      type="button"
      onClick={openModelContext}
      title={`Context: ${pct}% · ~${formatK(est)} / ${formatK(windowTokens)} est tokens (click for details)`}
      className={cn(
        "hidden lg:inline-flex items-center gap-2 px-2 py-1 rounded-md border text-[10px] font-mono tabular-nums transition-colors",
        tone.bg,
        tone.text,
        "hover:brightness-110",
      )}
    >
      {/* Tiny inline progress bar so the % has visual weight without taking space */}
      <span className="relative w-10 h-1.5 rounded-full bg-muted overflow-hidden">
        <span
          className={cn("absolute inset-y-0 left-0", tone.bar)}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span>{pct}%</span>
      <span className="text-muted-foreground">·</span>
      <span>{formatK(est)} tok</span>
    </button>
  );
}

function formatK(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}K`;
  return `${Math.round(n / 1000)}K`;
}
