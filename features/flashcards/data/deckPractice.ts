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

/**
 * The order a TEST's review opens its cards in: what needs practice first
 * (worst first), then cards never studied (in the given order), then the solid
 * ones, weakest first — so studying for a test with a fresh deck still opens
 * real cards, and a half-learned one starts where the learner is weakest.
 * Every id in `cardIds` appears exactly once.
 */
export function rankTestStudy(
  cardIds: readonly string[],
  masteries: readonly ItemMasteryRow[],
  now: Date = new Date(),
): string[] {
  const byCard = new Map(masteries.map((m) => [m.item_id, m]));
  const unique = [...new Set(cardIds)];
  const weak = rankDeckPractice(
    unique.flatMap((id) => {
      const m = byCard.get(id);
      return m ? [m] : [];
    }),
    now,
  ).map((m) => m.item_id);
  const weakSet = new Set(weak);
  const fresh = unique.filter((id) => (byCard.get(id)?.attempt_count ?? 0) === 0);
  const freshSet = new Set(fresh);
  const solid = unique
    .filter((id) => !weakSet.has(id) && !freshSet.has(id))
    .sort(
      (a, b) =>
        (displayMasteryPct(byCard.get(a)!, now) ?? 0) -
        (displayMasteryPct(byCard.get(b)!, now) ?? 0),
    );
  return [...weak, ...fresh, ...solid];
}
