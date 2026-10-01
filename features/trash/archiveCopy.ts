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
/**
 * The same three facts where "archive" already means something else (the Knowledge hub's
 * triage Archive): "This moves "Q3 call" to Trash. It leaves this list, and you can restore it
 * from Trash."
 */
export function trashConfirmSentence(what: string): string {
  const subject = what.trim() || "it";
  return `This moves ${subject} to Trash. It leaves this list, and you can restore it from Trash.`;
}

/**
 * Where a person restores what they archived — the place the page actually offers.
 *   trash          — /trash (the default: every soft-deleted kind it lists).
 *   archive_filter — the page's own ArchiveFilter ("Archived only", THE ARCHIVED-ITEMS LAW); a
 *                    list that carries the filter restores in place, so its confirm names it
 *                    (V6-B 2026-10-01: the Sources page said "Trash" while offering the filter).
 *   list_filters   — an entity list's Filters & Sort panel, section "Archived" (lib/entity-list
 *                    `EntityFilterPanel`, every list with `supportsArchived` not false). Its
 *                    control reads "Archived", not "Archived only" (verify-7 #2, 2026-10-01: the
 *                    flashcards confirm said "Trash" and the page offered no Trash control).
 */
export type ArchiveRestorePlace = "trash" | "archive_filter" | "list_filters";

const RESTORE_PLACE_WORDS: Record<ArchiveRestorePlace, string> = {
  trash: "Trash",
  // The filter's own label (`ARCHIVE_FILTER_LABELS.archived` in @ai-matrx/design-system).
  archive_filter: "Archived only",
  // EntityFilterPanel's button and its section heading.
  list_filters: "Filters → Archived",
};

export interface ArchiveConfirmOptions {
  /** How many things are archived; more than one says "They … them". Default 1. */
  count?: number;
  /** Where the page lets the person restore them. Default Trash. */
  restoreFrom?: ArchiveRestorePlace;
}

export function archiveConfirmSentence(what: string, options: ArchiveConfirmOptions = {}): string {
  const subject = what.trim() || "it";
  const many = (options.count ?? 1) > 1;
  const place = RESTORE_PLACE_WORDS[options.restoreFrom ?? "trash"];
  return many
    ? `This archives ${subject}. They leave this list, and you can restore them from ${place}.`
    : `This archives ${subject}. It leaves this list, and you can restore it from ${place}.`;
}
