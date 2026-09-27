"use client";

// components/merge-field-input/MergeFieldInput.tsx
//
// A text field whose `{{merge.fields}}` show as readable chips ("Reply body")
// instead of raw braces, while the value it reads and writes is the exact
// stored text. For any template-like text a non-technical person edits — a
// message template body or subject, a notification, an assist.
//
// Why not ProTextarea/ProInput: a <textarea> can only draw characters, so it
// cannot show a chip in place of `{{…}}` without showing the braces. This is
// a small contenteditable: text runs are plain text, each field is one atomic,
// non-editable chip, Enter inserts a newline (multiline) or nothing (single
// line), and paste is plain text only. Typing `{{name}}` by hand turns into a
// chip as soon as it is complete. Mic and page-agent buttons are not here —
// the host keeps offering those elsewhere.
//
// DOM work lives in `merge-field-dom.ts` (unit-tested in jsdom).

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  hasUnrenderedField,
  needsTrailingLine,
  pointAtStoredOffset,
  renderInto,
  serializeFrom,
  storedOffsetOf,
} from "./merge-field-dom";

export interface MergeFieldInputHandle {
  /** Insert `{{path}}` at the caret (or where the caret last was), as a chip. */
  insertField: (path: string) => void;
  focus: () => void;
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
  onFocus?: () => void;
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
      onFocus,
      ...aria
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    /** The text this element last drew or emitted — a different `value` means an outside change. */
    const shownRef = useRef<string | null>(null);
    /** Caret in stored-text offsets, kept across blur so Insert lands where the person was. */
    const caretRef = useRef<number | null>(null);

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
      if (value !== shownRef.current) draw(value, caretRef.current);
    });

    const currentCaret = (): number | null => {
      const root = rootRef.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      if (!root.contains(range.startContainer)) return null;
      return storedOffsetOf(root, range.startContainer, range.startOffset);
    };

    const emit = () => {
      const root = rootRef.current;
      if (!root) return;
      let text = serializeFrom(root);
      if (!multiline) text = text.replace(/\n/g, " ");
      const caret = currentCaret();
      caretRef.current = caret;
      // A field typed by hand, or pasted, becomes a chip once complete.
      if (
        hasUnrenderedField(root) ||
        needsTrailingLine(root) ||
        (!multiline && text !== serializeFrom(root))
      ) {
        draw(text, caret);
      } else {
        shownRef.current = text;
      }
      onChange(text);
    };

    const insertText = (text: string) => {
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
      insertField: (path: string) => {
        const current = shownRef.current ?? value;
        const at = Math.min(caretRef.current ?? current.length, current.length);
        const token = `{{${path}}}`;
        const next = current.slice(0, at) + token + current.slice(at);
        caretRef.current = at + token.length;
        rootRef.current?.focus();
        draw(next, caretRef.current);
        onChange(next);
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
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-placeholder={placeholder}
        onFocus={onFocus}
        onInput={emit}
        onKeyUp={() => (caretRef.current = currentCaret())}
        onMouseUp={() => (caretRef.current = currentCaret())}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (multiline) {
              insertText("\n");
              emit();
            }
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          insertText(multiline ? text : text.replace(/\n/g, " "));
          emit();
        }}
        onDrop={(e) => e.preventDefault()}
        className={cn(
          "w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm outline-none sm:text-sm",
          "focus-visible:ring-1 focus-visible:ring-ring",
          "whitespace-pre-wrap break-words",
          "empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
          multiline ? "min-h-40 leading-relaxed" : "min-h-9 whitespace-nowrap overflow-x-auto",
          className,
        )}
      />
    );
  },
);
