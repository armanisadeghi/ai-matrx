// features/flashcards/routes.ts
//
// THE flashcards URLs. Dependency-free so any surface (chat blocks, canvas,
// windows) can link into a deck without importing the home list module.

export const FLASHCARD_SETS_BASE = "/education/flashcards";
export const FAST_FIRE_BASE = "/education/fastfire";

export const flashcardSetHref = (row: { id: string }) =>
  `${FLASHCARD_SETS_BASE}/${row.id}`;
export const flashcardStudyHref = (row: { id: string }) =>
  `${FLASHCARD_SETS_BASE}/${row.id}/study`;
