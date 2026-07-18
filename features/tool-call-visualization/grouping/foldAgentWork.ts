/**
 * foldAgentWork — pure, order-preserving fold of a SETTLED turn's interleaved
 * items into "Agent worked" groups.
 *
 * The transcript problem: an agentic turn is often a long alternation of
 * thinking runs, generic tool calls, and one-line "let me fix that" texts.
 * Live, each renders individually (real-time feedback). Once the turn is
 * settled (stream ended, or loaded from the DB), that back-and-forth is
 * process noise — the user cares about the deliverable, and the process
 * collapses into ONE quiet line: "Worked for 26s".
 *
 * This module is deliberately generic over the item type: the live path folds
 * `GroupedSlot[]` and the persisted path folds `GroupedSegment[]` with the
 * exact same algorithm, so the two renderers can never drift. The caller
 * classifies each item:
 *
 *   - "work"      — always foldable: thinking, status lines, and tool calls
 *                   whose display mode is "auto" (no result-is-purpose /
 *                   stay-open renderer — those stay visible).
 *   - "shortText" — a short spoken aside between work items ("Got it, let me
 *                   fix the references."). Folds ONLY in the interior of a
 *                   run: leading intros and the trailing final answer are
 *                   trimmed back out, so the group never swallows the actual
 *                   reply.
 *   - "visible"   — everything else. Breaks the run.
 *
 * Ordering law: the output, flattened, is IDENTICAL to the input. This pass
 * only wraps consecutive items — it never reorders, drops, or duplicates
 * (guarded by foldAgentWork.test.ts alongside interleave-ordering.test.ts).
 */

export type AgentWorkClass = "work" | "shortText" | "visible";

/**
 * A text item at or under this many trimmed characters may fold into an
 * agent-work group when it sits BETWEEN work items. Roughly a short
 * paragraph — long enough for the agent's mid-work narration ("I'm
 * expanding the search to identify all instances where…"), short enough
 * that real content never disappears.
 */
export const SHORT_TEXT_FOLD_MAX = 400;

/** A group must actually hide a back-and-forth: at least this many items. */
export const AGENT_WORK_MIN_ITEMS = 2;

export interface AgentWorkFold<T> {
  kind: "agent_work";
  /** The folded items, in their original order. */
  items: T[];
  /** Human step count (a tool batch counts each call). */
  stepCount: number;
  /** Wall-clock span across the folded items, when timestamps exist. */
  durationMs: number | null;
}

export interface FoldAgentWorkAccessors<T> {
  classify: (item: T) => AgentWorkClass;
  /** Steps an item represents (tool batch → its call count; default 1). */
  stepsOf: (item: T) => number;
  /** Epoch-ms span of an item (tool started/completed), or null if unknown. */
  spanOf: (item: T) => { start: number; end: number } | null;
}

export function foldAgentWork<T>(
  items: T[],
  { classify, stepsOf, spanOf }: FoldAgentWorkAccessors<T>,
): Array<T | AgentWorkFold<T>> {
  const out: Array<T | AgentWorkFold<T>> = [];

  for (let i = 0; i < items.length;) {
    const cls = classify(items[i]);
    if (cls === "visible") {
      out.push(items[i]);
      i++;
      continue;
    }

    // Maximal run of work + shortText items.
    let j = i;
    while (j < items.length && classify(items[j]) !== "visible") j++;
    let run = items.slice(i, j);

    // Trim shortText off both ends — an intro sentence stays above the
    // group and the final answer (even a short one) stays below it. Only
    // text sandwiched between work items folds.
    let lo = 0;
    let hi = run.length;
    while (lo < hi && classify(run[lo]) === "shortText") lo++;
    while (hi > lo && classify(run[hi - 1]) === "shortText") hi--;
    const leading = run.slice(0, lo);
    const trailing = run.slice(hi);
    run = run.slice(lo, hi);

    out.push(...leading);

    const hasWork = run.some((item) => classify(item) === "work");
    if (run.length >= AGENT_WORK_MIN_ITEMS && hasWork) {
      let stepCount = 0;
      let start = Infinity;
      let end = -Infinity;
      for (const item of run) {
        stepCount += Math.max(1, stepsOf(item));
        const span = spanOf(item);
        if (span) {
          if (span.start < start) start = span.start;
          if (span.end > end) end = span.end;
        }
      }
      out.push({
        kind: "agent_work",
        items: run,
        stepCount,
        durationMs: end > start ? Math.round(end - start) : null,
      });
    } else {
      out.push(...run);
    }

    out.push(...trailing);
    i = j;
  }

  return out;
}

/** "26s", "1m 12s" — the header's duration text. */
export function formatWorkDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
