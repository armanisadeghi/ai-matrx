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

export interface EditorInsertTargets {
  /** A contentEditable editor addressed by `data-editor-id`. */
  editorId?: string;
  /** The surface's textarea — may return null when no textarea is mounted now. */
  getTextarea?: () => HTMLTextAreaElement | null;
  /** A rich editor's insert-at-the-caret. Returns false when it cannot take it. */
  insertAtCaret?: (text: string) => boolean;
  /** Full-value write-back for a controlled textarea. */
  onTextReplace?: (nextValue: string) => void;
}

/** The text to insert, shaped per target (a textarea knows its neighbours). */
export interface EditorInsertText {
  editor: string;
  textarea: (field: HTMLTextAreaElement) => string;
  caret: string;
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

  if (editorId && insertTextAtCursor(editorId, shaped.editor)) return "editor";

  const field = editorId ? null : (getTextarea?.() ?? null);
  if (field && insertTextAtTextareaCursor(field, shaped.textarea(field), onTextReplace)) {
    return "textarea";
  }

  if (insertAtCaret?.(shaped.caret)) return "caret";
  return null;
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
