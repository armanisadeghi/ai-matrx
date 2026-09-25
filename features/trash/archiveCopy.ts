// features/trash/archiveCopy.ts
//
// THE ONE ARCHIVE SENTENCE. Every confirm in front of a soft delete (a row that
// gets `deleted_at` and is listed by /trash through `platform.entity_types
// .user_artifact_kind`) says this, so a person always hears the same three
// facts: what happens (it is archived, not destroyed), what they will notice
// (it leaves the list), and where it comes back from (Trash).
//
// Owner rule (Arman, 2026-09-20): archive, never delete — and an archive
// without a restore is a lie. Only use this sentence for a kind /trash actually
// lists; a real hard delete keeps its own honest "cannot be undone" copy.

/** Where an archived record is restored from. */
export const TRASH_HREF = "/trash";

/**
 * "This archives the show. It leaves this list, and you can restore it from Trash."
 *
 * `what` is the thing as a person would say it: "the show", "this map",
 * `"Q3 pricing scan"` (quoted names are passed already quoted).
 */
export function archiveConfirmSentence(what: string): string {
  const subject = what.trim() || "it";
  return `This archives ${subject}. It leaves this list, and you can restore it from Trash.`;
}
