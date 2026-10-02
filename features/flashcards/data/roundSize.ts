// features/flashcards/data/roundSize.ts
//
// How many cards one Test or Write round deals. The learner picks it (saved
// per person at `userPreferences.flashcard.testQuestionCount` /
// `writeCardCount`); `0` means every card. A round is a random subset of the
// deck — the same card order every time is a memorised sequence, not recall.

/** The fixed sizes offered; "All" (0) is always offered alongside them. */
export const ROUND_SIZE_OPTIONS = [5, 10, 20] as const;
/** `0` = every card in the deck. */
export const ROUND_SIZE_ALL = 0;

/** Cards the round actually deals: the requested size clamped to the deck.
 *  A non-number or negative value falls back to `fallback`. */
export function clampRoundSize(
  requested: unknown,
  deckSize: number,
  fallback: number,
): number {
  const wanted =
    typeof requested === "number" && Number.isFinite(requested) && requested >= 0
      ? Math.floor(requested)
      : fallback;
  if (wanted === ROUND_SIZE_ALL) return Math.max(0, deckSize);
  return Math.max(0, Math.min(wanted, deckSize));
}

/** The choices offered for a deck: every fixed size smaller than the deck,
 *  then "All". Fewer than two choices means there is nothing to pick. */
export function roundSizeChoices(deckSize: number): number[] {
  if (deckSize <= 0) return [];
  const choices: number[] = ROUND_SIZE_OPTIONS.filter((n) => n < deckSize);
  choices.push(ROUND_SIZE_ALL);
  return choices;
}

/** The value a choice is saved as when it equals the deck size. */
export function roundSizeValue(dealt: number, deckSize: number): number {
  return dealt >= deckSize ? ROUND_SIZE_ALL : dealt;
}

export function shuffleItems<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A shuffled round of `size` items (`0` or ≥ length = all, shuffled). */
export function pickRound<T>(items: readonly T[], size: number): T[] {
  const shuffled = shuffleItems(items);
  if (size <= 0 || size >= items.length) return shuffled;
  return shuffled.slice(0, size);
}
