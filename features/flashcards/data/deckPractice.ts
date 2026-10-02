// features/flashcards/data/deckPractice.ts
//
// "Needs practice" for ONE deck — the rule the deck's Progress screen lists
// and the deck-scoped weak-area drill (`/education/flashcards/weak-areas?set=`)
// opens, so the cards a learner sees under "Needs practice" are exactly the
// cards "Practice these" drills. A studied card needs practice when its live
// recall tier is Struggling or Learning (< 70%, `masteryTier`) or FSRS flagged
// it as a struggle. Worst first: struggle flag, then lowest live recall.
//
// Pure — no I/O.

import type { ItemMasteryRow } from "@/features/education/study/types";
import {
  displayMasteryPct,
  masteryTier,
} from "@/features/education/study/utils/masteryFsrs";

export function needsDeckPractice(m: ItemMasteryRow, now: Date): boolean {
  if ((m.attempt_count ?? 0) === 0) return false;
  if (m.struggle_flag) return true;
  const { tier } = masteryTier(m, now);
  return tier === "struggling" || tier === "learning";
}

/** The deck's cards that need practice, worst first. */
export function rankDeckPractice(
  masteries: ItemMasteryRow[],
  now: Date = new Date(),
): ItemMasteryRow[] {
  return masteries
    .filter((m) => needsDeckPractice(m, now))
    .sort((a, b) => {
      if (Boolean(a.struggle_flag) !== Boolean(b.struggle_flag))
        return a.struggle_flag ? -1 : 1;
      return (displayMasteryPct(a, now) ?? 0) - (displayMasteryPct(b, now) ?? 0);
    });
}
