/**
 * content-blocks.util — canonical helper for turning an edited plain-text
 * string back into a `cx_message.content` block array WITHOUT destroying the
 * message's non-text blocks (image / audio / video / document / context
 * chips, etc.).
 *
 * Why this exists: every "edit a message" callsite used to wrap the edited
 * text as a fresh `[{type:'text', text}]` array, silently dropping any
 * attachments the message carried. The full-screen editor only edits the
 * text, so the attachments must be re-attached on save. This is the single
 * place that knows how to do that. Use it from any edit/resubmit path.
 *
 * Order rule: text first, then the preserved non-text blocks. A user message
 * is rendered as "text line + attachment chips", so leading the array with
 * the text block keeps the flat-text extraction (`extractFlatText`) correct
 * while the chips follow.
 */

import type { Json } from "@/types/database.types";

function isTextBlock(block: unknown): boolean {
  return (
    !!block &&
    typeof block === "object" &&
    (block as { type?: unknown }).type === "text"
  );
}

/**
 * Merge `newText` into `existingContent`, keeping every non-text block.
 *
 * - `existingContent` is the raw `cx_message.content` (usually a
 *   `CxContentBlock[]`, but tolerated as anything — a non-array falls back to
 *   a single text block).
 * - Returns a fresh `Json` block array suitable for `editMessage`.
 */
export function mergeEditedText(existingContent: unknown, newText: string): Json {
  const textBlock = { type: "text", text: newText };

  if (!Array.isArray(existingContent)) {
    return [textBlock];
  }

  const preserved = existingContent.filter((block) => !isTextBlock(block));
  return [textBlock, ...preserved];
}
