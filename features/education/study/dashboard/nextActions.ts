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

/**
 * Spine item types that are the SAME thing to a learner, folded onto one key.
 *
 * `education.item_mastery` holds both `fc_card` and the pre-rename `flashcard`
 * spelling, and grouping on the raw value rendered two separate "Flashcards"
 * lanes on the study surfaces — "Flashcards: 27 due" directly above
 * "Flashcards: 3 due", which reads as a bug and makes the counts untrustworthy.
 * Fold aliases here, not at the label, so the COUNTS merge too.
 */
const ITEM_TYPE_ALIASES: Record<string, string> = {
  flashcard: "fc_card",
};

/** The canonical spine key for an item type. */
export function canonicalItemType(itemType: string): string {
  return ITEM_TYPE_ALIASES[itemType] ?? itemType;
}

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
    const itemType = canonicalItemType(m.item_type);
    let sig = byType.get(itemType);
    if (!sig) {
      sig = {
        itemType,
        label: itemTypeLabel(itemType),
        due: 0,
        weak: 0,
      };
      byType.set(itemType, sig);
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

/**
 * Deep link into a mode's due-review surface (null when it has no dedicated one
 * yet).
 *
 * 🚨 The keys here are the study spine's REAL `item_mastery.item_type` values,
 * verified against the live table. An earlier version switched on
 * `quiz_question` / `practice_test_item`, which the spine has never written —
 * so every quiz and practice-test item the learner had due surfaced in "Study
 * today" with NO link (THE DOOR LAW), while the two branches that did exist
 * were dead code. Assessment items of both kinds are stored as
 * `assessment_item`; `flashcard` is the pre-`fc_card` spelling and still has
 * rows, so it maps to the same review surface rather than falling through.
 * Before adding a case, confirm the value exists:
 *   select distinct item_type from education.item_mastery;
 */
export function modeReviewHref(itemType: string): string | null {
  switch (itemType) {
    case "fc_card":
    case "flashcard":
      return "/education/flashcards/review";
    case "assessment_item":
      return "/education/quizzes";
    case "spoken_prompt":
      return "/education/practice-oral";
    case "handwritten_work":
      return "/education/grade-work";
    default:
      return null;
  }
}

/** Deep link into a mode's weak-area drill (falls back to its review surface). */
export function modeWeakHref(itemType: string): string | null {
  switch (itemType) {
    case "fc_card":
    case "flashcard":
      return "/education/flashcards/weak-areas";
    default:
      return modeReviewHref(itemType);
  }
}
