/**
 * Quick Note Save vocabulary — the runtime constants behind the capture
 * form's enums.
 *
 * Deliberately a PURE module (no "use client", no React, no Redux): the
 * surface manifest imports these to spell the enums out in its write-target
 * description, and a manifest must stay importable without dragging the
 * hook's Redux/toast graph along with it. `useQuickNoteSave` re-exports the
 * derived types so existing consumers are unchanged.
 *
 * The types are DERIVED from the arrays, never typed twice — the handler that
 * validates an agent's write and the description that tells the agent what is
 * legal read from the same source.
 */

/** Where a capture lands: a brand-new note, or an existing one. */
export const SAVE_MODES = ["create", "update"] as const;
export type SaveMode = (typeof SAVE_MODES)[number];

/** How a capture combines with the existing body when saving into a note. */
export const UPDATE_METHODS = ["append", "overwrite"] as const;
export type UpdateMethod = (typeof UPDATE_METHODS)[number];

/**
 * Fields the `note_draft` surface write target accepts. Anything else is
 * refused by name rather than silently dropped.
 */
export const NOTE_DRAFT_FIELDS = ["note_name", "folder", "content"] as const;
export type NoteDraftField = (typeof NOTE_DRAFT_FIELDS)[number];
