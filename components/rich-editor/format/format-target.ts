// components/rich-editor/format/format-target.ts
//
// ONE formatting command layer over three editor engines (Arman, 2026-10-04:
// "The formatting buttons need to work even when we are just showing plain
// text"). A FormatTarget is the active editor, whatever it is:
//
//   visual   (Tiptap)      — marks and nodes (the editor's own toggles)
//   source   (CodeMirror)  — markdown text edits (`core/markdown-format.ts`)
//   textarea (any <textarea>: notes Plain/Split, ProTextarea, prompt editors)
//                          — the same text edits, applied through the browser's
//                            own editing path so native undo (⌘Z) takes them back
//
// The ONE selection toolbar's formatting actions (`visual/format-actions.ts`)
// and every host's keyboard chords run commands through this interface only.
// This file stays free of Tiptap (ProTextarea imports it); the visual engine
// lives in `visual/visual-format-target.ts`.

import { formatMarkdown, isFormatActive, type FormatCommandId } from "../core/markdown-format";
import { applySourceEdit, type SourceEditResult } from "../core/source-format";

export type FormatEngine = "visual" | "source" | "textarea";

export interface FormatTarget {
  engine: FormatEngine;
  /** Run a command. False when the editor refused (read-only, destroyed). */
  run(command: FormatCommandId): boolean;
  /** Is the command already on for the selection (the toolbar's pressed state)? */
  isActive(command: FormatCommandId): boolean;
  /** Is there something to format (an editable, non-blank selection)? */
  canFormat(): boolean;
  /** Call `onChange` when the selection or text moves (pressed state follows). */
  subscribe?(onChange: () => void): () => void;
}

/** The selection-zone host half every non-visual engine contributes. */
export const MARKDOWN_FORMAT_HOST_KEY = "markdownFormat";

export interface MarkdownFormatHost {
  kind: "markdown-format";
  target: FormatTarget;
}

export function markdownFormatHost(target: FormatTarget): Record<string, unknown> {
  const host: MarkdownFormatHost = { kind: "markdown-format", target };
  return { [MARKDOWN_FORMAT_HOST_KEY]: host };
}

// ── text engines (source + textarea) ────────────────────────────────────────

export interface TextSelectionState {
  text: string;
  from: number;
  to: number;
  editable: boolean;
}

/** Any engine whose document is markdown text. `apply` writes the minimal change. */
export function textFormatTarget(
  engine: "source" | "textarea",
  read: () => TextSelectionState | null,
  apply: (result: SourceEditResult, text: string) => void,
  subscribe?: (onChange: () => void) => () => void,
): FormatTarget {
  return {
    engine,
    run: (command) => {
      const state = read();
      if (!state || !state.editable) return false;
      const result = formatMarkdown(state.text, state.from, state.to, command);
      if (result.changes.length === 0) return false;
      apply(result, state.text);
      return true;
    },
    isActive: (command) => {
      const state = read();
      return state ? isFormatActive(state.text, state.from, state.to, command) : false;
    },
    canFormat: () => {
      const state = read();
      return Boolean(state?.editable && state.text.slice(state.from, state.to).trim());
    },
    subscribe,
  };
}

/**
 * Write a text edit into a <textarea> so the browser's own undo takes it back
 * and React's onChange sees it: the changes collapse to ONE replaced span (the
 * bytes between them are re-inserted unchanged), inserted with
 * `execCommand("insertText")` — the editing path that records undo — with
 * `setRangeText` + an input event where that path is unavailable.
 */
export function applyEditToTextarea(el: HTMLTextAreaElement, result: SourceEditResult): void {
  const text = el.value;
  if (result.changes.length > 0) {
    const from = Math.min(...result.changes.map((c) => c.from));
    const to = Math.max(...result.changes.map((c) => c.to));
    const after = applySourceEdit(text, result);
    const insert = after.slice(from, after.length - (text.length - to));
    el.focus({ preventScroll: true });
    el.setSelectionRange(from, to);
    let done = false;
    try {
      done =
        typeof document.execCommand === "function" &&
        (insert === "" ? document.execCommand("delete", false) : document.execCommand("insertText", false, insert));
    } catch {
      done = false;
    }
    if (!done || el.value !== after) {
      // No native editing path (old engines, jsdom): write the same bytes and
      // tell React. Undo is then the host's own (notes keep a record history).
      if (el.value !== text) el.value = text;
      el.setRangeText(insert, from, to, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  el.setSelectionRange(result.anchor, result.head);
}

/** The textarea engine. */
export function textareaFormatTarget(el: HTMLTextAreaElement): FormatTarget {
  return textFormatTarget(
    "textarea",
    () => ({
      text: el.value,
      from: el.selectionStart ?? 0,
      to: el.selectionEnd ?? 0,
      editable: !el.readOnly && !el.disabled && el.isConnected,
    }),
    (result) => applyEditToTextarea(el, result),
    (onChange) => {
      el.addEventListener("input", onChange);
      el.addEventListener("select", onChange);
      return () => {
        el.removeEventListener("input", onChange);
        el.removeEventListener("select", onChange);
      };
    },
  );
}
