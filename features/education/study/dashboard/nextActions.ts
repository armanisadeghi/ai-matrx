// features/education/study/dashboard/nextActions.ts
//
// Mode-agnostic synthesis of "what's due / weak right now" for the unified
// Study Today hero. Reads the cross-mode mastery snapshot (studyService
// .listAllMastery) — exactly like useStudyAnalytics — so quiz / game / audio
// items surface alongside flashcards instead of the hero being hardcoded to
// fc_card. Pure over injected `now`.

import { displayMasteryPct } from "../utils/masteryFsrs";
import { itemTypeLabel } from "../analytics/computeAnalytics";
import type { ItemMasteryRow } from "../types";

/** An item is "weak" if flagged struggling or its live mastery is below this. */
const WEAK_PCT = 0.4;

export interface ModeSignal {
  itemType: string;
  label: string;
  /** Items of this type due for review now (FSRS `due_at <= now`). */
  due: number;
  /** Studied items of this type that are weak right now. */
  weak: number;
}

/**
 * Per-item-type due + weak counts across ALL study modes. Weak matches the
 * weak-area drill surface (only items with ≥1 attempt count), and mastery is
 * recomputed live (never trusting the decayed write-time snapshot).
 */
export function dueWeakByMode(
  mastery: ItemMasteryRow[],
  now: Date,
): ModeSignal[] {
  const byType = new Map<string, ModeSignal>();
  const nowMs = now.getTime();
  for (const m of mastery) {
    let sig = byType.get(m.item_type);
    if (!sig) {
      sig = {
        itemType: m.item_type,
        label: itemTypeLabel(m.item_type),
        due: 0,
        weak: 0,
      };
      byType.set(m.item_type, sig);
    }
    if (m.due_at && new Date(m.due_at).getTime() <= nowMs) sig.due += 1;
    if ((m.attempt_count ?? 0) > 0) {
      const pct = displayMasteryPct(m, now) ?? 0;
      if (m.struggle_flag || pct < WEAK_PCT) sig.weak += 1;
    }
  }
  // Busiest modes first so the hero shows the highest-signal work.
  return Array.from(byType.values()).sort(
    (a, b) => b.due + b.weak - (a.due + a.weak),
  );
}

/** Deep link into a mode's due-review surface (null when it has no dedicated one yet). */
export function modeReviewHref(itemType: string): string | null {
  switch (itemType) {
    case "fc_card":
      return "/education/flashcards/review";
    case "quiz_question":
      return "/education/quizzes";
    case "practice_test_item":
      return "/education/practice-tests";
    default:
      return null;
  }
}

/** Deep link into a mode's weak-area drill (falls back to its review surface). */
export function modeWeakHref(itemType: string): string | null {
  switch (itemType) {
    case "fc_card":
      return "/education/flashcards/weak-areas";
    default:
      return modeReviewHref(itemType);
  }
}
