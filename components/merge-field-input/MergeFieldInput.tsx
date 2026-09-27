"use client";

// components/merge-field-input/MergeFieldInput.tsx
//
// A text field whose `{{merge.fields}}` show as readable chips ("Reply body")
// instead of raw braces, while the value it reads and writes is the exact
// stored text. For any template-like text a non-technical person edits — a
// message template body or subject, a notification, an assist.
//
// A <textarea> can only draw characters, so it cannot show a chip in place of
// `{{…}}` without showing the braces. This is a small contenteditable: text
// runs are plain text, each field is one atomic, non-editable chip, Enter
// inserts a newline (multiline) or nothing (single line), and paste is plain
// text only. Typing `{{name}}` by hand turns into a chip once complete.
//
// It is hosted INSIDE ProTextarea (its `editor` slot), so it keeps the one
// field toolbar every text field has — mic/dictation, the "…" menu, page
// agents, right-click. Use `<MergeFieldTextarea>` below, not this directly.
//
// Undo is its own (`merge-field-history.ts`): the chip redraws defeat the
// browser's native stack, so every change — typing, an inserted field, an
// auto-chip, a paste, dictation — is recorded and Cmd/Ctrl+Z, Shift+Cmd+Z and
// Edit ▸ Undo/Redo walk it.
//
// DOM work lives in `merge-field-dom.ts` (unit-tested in jsdom).

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import type { ProTextareaEditorHandle } from "@/components/official/pro-textarea-editor";
import { MergeFieldHistory, historyKey, type HistoryKind } from "./merge-field-history";
import {
  chipContaining,
  hasUnrenderedField,
  needsTrailingLine,
  pointAtStoredOffset,
  renderInto,
  serializeFrom,
  storedOffsetOf,
} from "./merge-field-dom";

export interface MergeFieldInputHandle extends ProTextareaEditorHandle {
  /** Insert `{{path}}` at the caret (or where the caret last was), as a chip. */
  insertField: (path: string) => void;
}

export interface MergeFieldInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Plain words for a field path: "party.first_name" → "Recipient first name". */
  fieldLabel: (path: string) => string;
  multiline?: boolean;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
}

/** Token-styled chip: readable in light and dark (foreground on a faint primary wash). */
export const MERGE_FIELD_CHIP_CLASS =
  "mx-0.5 inline-flex items-center rounded bg-primary/15 px-1 text-foreground ring-1 ring-inset ring-primary/40 font-sans font-medium select-all align-baseline";

export const MergeFieldInput = forwardRef<MergeFieldInputHandle, MergeFieldInputProps>(
  function MergeFieldInput(
    {
      value,
      onChange,
      fieldLabel,
      multiline = false,
      placeholder,
      id,
      className,
      style,
      disabled,
      onFocus,
      onBlur,
      onKeyDown: onKeyDownProp,
      ...aria
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    /** The text this element last drew or emitted — a different `value` means an outside change. */
    const shownRef = useRef<string | null>(null);
    /** Caret in stored-text offsets, kept across blur so Insert lands where the person was. */
    const caretRef = useRef<number | null>(null);
    const historyRef = useRef<MergeFieldHistory | null>(null);
    if (historyRef.current === null) historyRef.current = new MergeFieldHistory(value);

    const draw = (text: string, caret: number | null) => {
      const root = rootRef.current;
      if (!root) return;
      renderInto(root, text, fieldLabel, MERGE_FIELD_CHIP_CLASS);
      shownRef.current = text;
      if (caret !== null && document.activeElement === root) {
        const point = pointAtStoredOffset(root, caret);
        const sel = window.getSelection();
        const range = document.createRange();
        range.setStart(point.node, point.offset);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    };

    // Outside changes (initial value, an agent's draft, a save) redraw.
    useEffect(() => {
      if (value === shownRef.current) return;
      // The first draw is the starting point; later outside changes (an
      // agent's draft, a save) are undoable steps.
      if (shownRef.current !== null) historyRef.current?.record(value, null, "hard");
      draw(value, caretRef.current);
    });

    /** Commit a new text from any source: redraw if asked, record, emit. */
    const commit = (text: string, caret: number | null, kind: HistoryKind, redraw: boolean) => {
      if (redraw) draw(text, caret);
      else shownRef.current = text;
      caretRef.current = caret;
      historyRef.current?.record(text, caret, kind);
      onChange(text);
    };

    const applyHistory = (direction: "undo" | "redo") => {
      const entry =
        direction === "undo" ? historyRef.current?.undo() : historyRef.current?.redo();
      if (!entry) return;
      const caret = entry.caret ?? entry.text.length;
      caretRef.current = caret;
      draw(entry.text, caret);
      onChange(entry.text);
    };

    const currentCaret = (): number | null => {
      const root = rootRef.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      if (!root.contains(range.startContainer)) return null;
      return storedOffsetOf(root, range.startContainer, range.startOffset);
    };

    const emit = (kind: HistoryKind = "typing") => {
      const root = rootRef.current;
      if (!root) return;
      let text = serializeFrom(root);
      if (!multiline) text = text.replace(/\n/g, " ");
      const caret = currentCaret();
      // A field typed by hand, or pasted, becomes a chip once complete — its
      // own undo step.
      const chipped = hasUnrenderedField(root);
      const redraw =
        chipped || needsTrailingLine(root) || (!multiline && text !== serializeFrom(root));
      commit(text, caret, chipped ? "hard" : kind, redraw);
    };

    /**
     * A caret must never sit inside a chip: the browser would put typed text
     * into the non-editable chip (lost on save) or ignore it. Move it just
     * after the chip.
     */
    const keepCaretOutOfChips = () => {
      const root = rootRef.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const chip =
        chipContaining(root, range.startContainer) ?? chipContaining(root, range.endContainer);
      if (!chip) return;
      const after = document.createRange();
      after.setStartAfter(chip);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
    };

    const insertText = (text: string) => {
      keepCaretOutOfChips();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    };

    useImperativeHandle(ref, () => ({
      focus: () => rootRef.current?.focus(),
      getValue: () => shownRef.current ?? value,
      getSelection: () => {
        const root = rootRef.current;
        const sel = window.getSelection();
        const fallback = caretRef.current ?? (shownRef.current ?? value).length;
        if (!root || !sel || sel.rangeCount === 0) return { start: fallback, end: fallback };
        const range = sel.getRangeAt(0);
        if (!root.contains(range.startContainer)) return { start: fallback, end: fallback };
        return {
          start: storedOffsetOf(root, range.startContainer, range.startOffset),
          end: storedOffsetOf(root, range.endContainer, range.endOffset),
        };
      },
      // Dictation, the "…" menu and agents write here — one undoable step per burst.
      write: (next: string) => {
        const text = multiline ? next : next.replace(/\n/g, " ");
        commit(text, text.length, "external", true);
        return true;
      },
      insertField: (path: string) => {
        const current = shownRef.current ?? value;
        const at = Math.min(caretRef.current ?? current.length, current.length);
        const token = `{{${path}}}`;
        const next = current.slice(0, at) + token + current.slice(at);
        rootRef.current?.focus();
        commit(next, at + token.length, "hard", true);
      },
    }));

    return (
      <div
        ref={rootRef}
        id={id}
        role="textbox"
        aria-multiline={multiline}
        aria-label={aria["aria-label"]}
        aria-labelledby={aria["aria-labelledby"]}
        aria-placeholder={placeholder}
        contentEditable={!disabled}
        aria-disabled={disabled || undefined}
        suppressContentEditableWarning
        spellCheck
        data-placeholder={placeholder}
        onFocus={onFocus}
        onBlur={onBlur}
        onInput={() => emit()}
        onBeforeInput={(e) => {
          // Edit ▸ Undo/Redo and other native history requests.
          const inputType = (e.nativeEvent as InputEvent).inputType;
          if (inputType === "historyUndo" || inputType === "historyRedo") {
            e.preventDefault();
            applyHistory(inputType === "historyUndo" ? "undo" : "redo");
          }
        }}
        onKeyUp={() => {
          keepCaretOutOfChips();
          caretRef.current = currentCaret();
        }}
        onMouseUp={() => {
          keepCaretOutOfChips();
          caretRef.current = currentCaret();
        }}
        onKeyDown={(e) => {
          onKeyDownProp?.(e);
          const history = historyKey(e);
          if (history) {
            e.preventDefault();
            applyHistory(history);
            return;
          }
          // Home/End in a one-line field go to the true start/end, even when a
          // chip sits there (Chrome will not place a caret before a leading
          // non-editable chip on Home).
          if (!multiline && (e.key === "Home" || e.key === "End") && !e.shiftKey) {
            const root = rootRef.current;
            const sel = window.getSelection();
            if (root && sel) {
              e.preventDefault();
              const text = shownRef.current ?? value;
              const point = pointAtStoredOffset(root, e.key === "Home" ? 0 : text.length);
              const range = document.createRange();
              range.setStart(point.node, point.offset);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
              caretRef.current = e.key === "Home" ? 0 : text.length;
              return;
            }
          }
          keepCaretOutOfChips();
          if (e.key === "Enter") {
            e.preventDefault();
            if (multiline) {
              insertText("\n");
              emit("hard");
            }
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          insertText(multiline ? text : text.replace(/\n/g, " "));
          emit("hard");
        }}
        onDrop={(e) => e.preventDefault()}
        className={cn(
          "w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm outline-none sm:text-sm",
          "focus-visible:ring-1 focus-visible:ring-ring",
          "whitespace-pre-wrap break-words",
          "empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
          multiline ? "min-h-40 leading-relaxed" : "min-h-9 whitespace-nowrap overflow-x-auto",
          className,
          // A hosted field surface arrives with "flex" and a textarea's
          // "resize-y": text must flow inline and a div has no resize grip.
          "block resize-none",
        )}
        style={style}
      />
    );
  },
);
