import type { RetainedNoteConflictReview } from "./notes.types";

/** An omitted token never bypasses a pending command, including another mount. */
export function mayRunNoteConflictCommand(
  reviews: Record<string, RetainedNoteConflictReview>,
  noteId: string,
  requestId?: string,
): boolean {
  const pending = Object.values(reviews).filter(review => review.noteId === noteId && review.command.status === "pending");
  return requestId === undefined
    ? pending.length === 0
    : pending.length === 1 && pending[0]?.command.requestId === requestId;
}
