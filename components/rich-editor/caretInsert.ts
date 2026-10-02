/**
 * THE context menu's insert-at-the-caret for a host that drives a RichEditor.
 *
 * `inline` text replaces the selection where it is. A `block` (a reference
 * fence) goes through `insertText(…, "after")`, which places it on its own
 * paragraph at the END of the caret's block — never inside a word (G5 review,
 * 2026-10-02: "of" became "o" + block + "f"). One helper so the three note
 * hosts (desktop, content editor, mobile) cannot drift.
 */
import type { RichEditorController } from "./RichEditorImpl";

export function insertAtRichCaret(
  rich: RichEditorController | null,
  text: string,
  placement: "inline" | "block" = "inline",
): boolean {
  if (!rich) return false;
  if (placement === "block") rich.insertText(text, "after");
  else rich.replaceSelection(text);
  return true;
}
