// features/scopes/utils/incompleteValue.ts
//
// A SCOPE VALUE THAT WAS NOT READ WHOLE IS NEVER SAVED BACK AS IF IT WERE (lane 9 SCOPES-ON-THE-STORE,
// D1 follow-up, 2026-10-02).
//
// The record store keeps a value over 100,000 bytes as a file; its cell holds the first 1000
// characters. `wholeScopeValues` (service/storeScopeReads.ts) reads the file and hands the whole
// text — but when it cannot (file gone, size or SHA-256 mismatch, no Web Crypto, still being saved)
// the cell becomes the first words plus a bracketed sentence naming the file, and the cell carries
// `value_incomplete`. Every scope value editor seeds its field from `value_text`, so without this
// guard a person who opened the cell and saved — or edited the start and saved — would replace the
// real 140,000-character text with 1000 characters and a sentence. The one write path
// (`setContextValue` thunk) asks `incompleteSaveRefusal` before it writes.

/** What a cell that holds only the start of its value carries beside `value_text`. */
export interface IncompleteValue {
  /** The cell's own first words (the store's head), without the sentence that follows them. */
  head: string;
  /** The whole value's length in characters, when the pointer names it. */
  chars: number | null;
  /** The file that holds the whole text, when it has one yet. */
  file_id: string | null;
}

/** Every sentence `wholeScopeValues` appends to a value it could not read whole starts with this. */
export const INCOMPLETE_VALUE_MARKER = "… [This is the start of a ";

/** The refusal a person sees (error slot, ≤ 140 chars). */
export const INCOMPLETE_SAVE_REFUSAL = "Only the start of this value loaded. Paste the whole text to replace it.";

/**
 * The refusal sentence when saving `draft` over a cell that was not read whole would cut the real
 * value — else `null`. Refused: the seeded text unchanged, any draft still carrying the fallback
 * sentence, and a draft built on the cell's first words that is shorter than the whole value.
 * Allowed: a draft that replaces the text (anything else), an explicit clear, and a write that
 * sends no text at all (a different value column).
 */
export function incompleteSaveRefusal(
  cell: { value_text?: string | null; value_incomplete?: IncompleteValue | null } | undefined,
  draft: string | null | undefined,
): string | null {
  const incomplete = cell?.value_incomplete;
  if (!incomplete || draft === undefined || draft === null || draft === "") return null;
  if (draft === cell?.value_text) return INCOMPLETE_SAVE_REFUSAL;
  if (draft.includes(INCOMPLETE_VALUE_MARKER)) return INCOMPLETE_SAVE_REFUSAL;
  if (incomplete.head && draft.startsWith(incomplete.head)) {
    const whole = incomplete.chars ?? Number.POSITIVE_INFINITY;
    if ([...draft].length < whole) return INCOMPLETE_SAVE_REFUSAL;
  }
  return null;
}
