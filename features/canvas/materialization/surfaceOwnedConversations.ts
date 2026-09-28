// features/canvas/materialization/surfaceOwnedConversations.ts
//
// A conversation whose output a SURFACE writes itself. Its assistant turns are
// never materialized into canvas items or feature records (a deck, a mind map)
// by the stream's commit step.
//
// Why: a segmented generation (education/convert/segmentedGenerate.ts) runs one
// background agent call per section of a Source and saves ONE merged artifact.
// Every section's reply is a render block; the commit step materialized each
// of them, so a 6-section deck landed as 7 decks (the real one plus one per
// section) — found live 2026-09-28 on /education/flashcards/new.
//
// The claim is made the moment the run's request id is known (before the
// stream commits) and lives for this tab's session. Bounded so a long session
// cannot grow it without limit.

const MAX_CLAIMS = 2_000;
const owned = new Set<string>();

/** This conversation's output is written by the surface — never materialize it. */
export function claimConversationForSurface(conversationId: string): void {
  if (!conversationId) return;
  if (owned.size >= MAX_CLAIMS) {
    const oldest = owned.values().next().value;
    if (oldest !== undefined) owned.delete(oldest);
  }
  owned.add(conversationId);
}

export function isConversationSurfaceOwned(conversationId: string | null | undefined): boolean {
  return !!conversationId && owned.has(conversationId);
}
