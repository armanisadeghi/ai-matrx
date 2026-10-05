// features/flashcards/data/draftSourceHonesty.ts
//
// Two honest rules about the new-deck draft, kept pure so they are testable:
//   1. A Source added AFTER a run started is not in the deck. It stays in the
//      draft, marked, instead of being cleared with the ones the deck used.
//   2. A Source kept from before a reload that cannot be read is taken out of
//      the draft with a notice; one the person adds now keeps its own error.

/** Ids in the draft now that the run did not start from. Empty used set = a topic-only run. */
export function lateSourceIds(liveIds: readonly string[], usedIds: ReadonlySet<string>): string[] {
  return usedIds.size === 0 ? [] : liveIds.filter((id) => !usedIds.has(id));
}

export interface DraftCardLike {
  id: string;
  status: string;
  archived: boolean;
  state: string | null | undefined;
}

/** Restored cards whose measured state says there is nothing to read. Archived ones keep their Restore. */
export function unreadableRestoredIds(cards: readonly DraftCardLike[], restored: ReadonlySet<string>): string[] {
  return cards
    .filter(
      (c) =>
        restored.has(c.id) && c.status === "ready" && !c.archived && (c.state === "unavailable" || c.state === "failed"),
    )
    .map((c) => c.id);
}
