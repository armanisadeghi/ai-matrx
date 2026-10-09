// features/context-menu-v3/utils/insert-into-editor.ts
//
// THE one way the menu puts text INTO the editable surface it was opened on.
//
// A surface advertises up to three write targets: a contentEditable editor id,
// a textarea getter, and an `insertAtCaret` callback (rich editors). Which one
// is live is a CALL-TIME fact, never a prop-presence fact: a host that swaps
// editors in place (Notes: Split/Plain mount a textarea, Write mounts the rich
// editor) keeps passing `getTextarea` and simply has it return null while the
// rich editor is up. Gating the caret path on `!getTextarea` (the 2026-10-02
// "Insert reference… → Copied instead, 3/3 in Write mode" bug) let a dead
// getter veto the live editor. So each target is tried in order and the first
// one that is actually there and takes the text wins.

import { insertTextAtCursor } from "@/utils/editor-text-insertion";
import { insertTextAtTextareaCursor } from "@/utils/text-insertion";
import { blockBoundary } from "@ai-matrx/rich-editor/core/text-insertion";

/**
 * `inline` goes exactly at the caret; `block` (a reference fence, a section)
 * goes on its own line, never inside a word (G5 review, 2026-10-02: "of" became
 * "o" + block + "f") — BEFORE the caret's line only from its very start,
 * AFTER it otherwise (G11B: a right-click at the start of a line goes above;
 * G15, 2026-10-07: a character "first half" rule surprised wrapped
 * paragraphs). The one rule is `blockBoundary(…, "nearest")`
 * (@ai-matrx/rich-editor ≥ 0.3.1).
 */
export type EditorInsertPlacement = "inline" | "block";

export interface EditorInsertTargets {
  /** A contentEditable editor addressed by `data-editor-id`. */
  editorId?: string;
  /** The surface's textarea — may return null when no textarea is mounted now. */
  getTextarea?: () => HTMLTextAreaElement | null;
  /**
   * A rich editor's insert-at-the-caret. Returns false when it cannot take it.
   * A `block` must land on its own line/paragraph, never inside a word.
   */
  insertAtCaret?: (text: string, placement?: EditorInsertPlacement) => boolean;
  /** Full-value write-back for a controlled textarea. */
  onTextReplace?: (nextValue: string) => void;
}

/** The text to insert, shaped per target (a textarea knows its neighbours). */
export interface EditorInsertText {
  editor: string;
  textarea: (field: HTMLTextAreaElement) => string;
  caret: string;
  /** Default `inline`. */
  placement?: EditorInsertPlacement;
}

export type EditorInsertTarget = "editor" | "textarea" | "caret";

/** True when the surface advertises any write target at all. */
export function hasEditorInsertTarget(targets: EditorInsertTargets): boolean {
  return Boolean(targets.editorId) || Boolean(targets.getTextarea) || Boolean(targets.insertAtCaret);
}

/**
 * Insert into whichever target is live right now. Returns the target that took
 * the text, or null when none could (the caller then copies — never silent).
 */
export function insertIntoEditor(
  targets: EditorInsertTargets,
  text: string | EditorInsertText,
): EditorInsertTarget | null {
  const shaped: EditorInsertText =
    typeof text === "string" ? { editor: text, textarea: () => text, caret: text } : text;
  const { editorId, getTextarea, insertAtCaret, onTextReplace } = targets;
  const placement = shaped.placement ?? "inline";

  if (editorId) {
    const took = attempt("editor", () => {
      if (placement === "block") moveEditorCaretToLineEnd(editorId);
      return insertTextAtCursor(editorId, shaped.editor);
    });
    if (took) return "editor";
  }

  const field = editorId ? null : (getTextarea?.() ?? null);
  if (field) {
    const took = attempt("textarea", () => {
      if (placement === "block" && field.selectionStart === field.selectionEnd) {
        const at = blockBoundary(field.value, field.selectionStart, field.selectionEnd, "nearest");
        field.setSelectionRange(at, at);
      }
      return insertTextAtTextareaCursor(field, shaped.textarea(field), onTextReplace);
    });
    if (took) return "textarea";
  }

  if (insertAtCaret && attempt("caret", () => insertAtCaret(shaped.caret, placement))) return "caret";
  return null;
}

/**
 * A target that THROWS is a target that did not take the text — never an
 * exception that escapes into the caller. A rich editor's insert once threw
 * `TransformError` up through the reference picker's pick handler: the dialog
 * stayed open and nothing happened (G8B review, 2026-10-02). Now the next
 * target is tried, and with none left the caller copies and says so.
 */
function attempt(target: EditorInsertTarget, insert: () => boolean): boolean {
  try {
    return insert();
  } catch (error) {
    console.error(`[ContextMenuV3] ${target} insert failed`, error);
    return false;
  }
}

/**
 * A collapsed caret inside a contentEditable text node moves to an edge of its
 * line (the start only from the very start, else the end), so a block never
 * lands inside a word. A selection is left alone: it is replaced where it is.
 */
function moveEditorCaretToLineEnd(editorId: string): void {
  const editor = document.querySelector(`[data-editor-id="${editorId}"]`);
  const selection = window.getSelection();
  if (!editor || !selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!range.collapsed || !editor.contains(range.startContainer)) return;
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return;
  const text = node.textContent ?? "";
  const at = blockBoundary(text, range.startOffset, range.startOffset, "nearest");
  const next = document.createRange();
  next.setStart(node, at);
  next.collapse(true);
  selection.removeAllRanges();
  selection.addRange(next);
}

/**
 * A block that must sit on its own paragraph inside a textarea: blank lines
 * are added only where the neighbours do not already provide them.
 */
export function ownParagraph(block: string, field: HTMLTextAreaElement): string {
  const before = field.value.slice(0, field.selectionStart);
  const after = field.value.slice(field.selectionEnd);
  const lead = before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const tail = after.length === 0 || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  return `${lead}${block}${tail}`;
}
