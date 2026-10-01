// When "Review what goes in" opens by itself.
//
// verify-6 #4 (2026-10-01): above the size knob the review reopened on every
// reload and on every "Try again", because "already opened" was a ref that
// lived only as long as the mounted input. The rule: it opens by itself ONCE
// per set of Sources — the set it opened for is kept with the input's saved
// draft (wizardDraft), so a reload or a remount of the same set never reopens
// it, and adding or removing a Source (a new set) opens it again.

/** One key per set of Sources, independent of card order. "" when there is none. */
export function reviewSetKey(sourceKeys: readonly string[]): string {
  return [...new Set(sourceKeys)].sort().join("|");
}

export function shouldAutoOpenReview(input: {
  totalChars: number;
  /** The size knob; null while it is still being read. */
  threshold: number | null;
  /** reviewSetKey of the Sources now on the input. */
  setKey: string;
  /** The set it last opened for by itself (kept with the saved draft). */
  openedFor: string | null | undefined;
}): boolean {
  if (input.threshold === null || input.setKey === "") return false;
  if (input.totalChars <= input.threshold) return false;
  return input.setKey !== input.openedFor;
}
