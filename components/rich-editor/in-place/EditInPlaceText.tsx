"use client";

// components/rich-editor/in-place/EditInPlaceText.tsx
//
// EDIT IN PLACE at the INLINE level — a title, a name, one line. The same
// rules as `EditInPlace` (the same byte session, in-place-session.ts): a
// double-click on the text (or the host's Edit through `editing`) swaps it for
// a field in the same spot with the caret where the person clicked; Enter or
// ⌘/Ctrl+Enter saves, Escape cancels (a changed draft asks first), leaving the
// field saves. Nothing is written when nothing changed; an empty line is never
// written (the field asks for a name instead).

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createInPlaceSession } from "./in-place-session";

export interface EditInPlaceTextProps {
  /** The stored text. */
  value: string;
  canEdit: boolean;
  /** The host's write — called only with changed, non-empty text. */
  write: (text: string) => Promise<unknown> | unknown;
  /** The rendered text (a heading, a label). */
  children: ReactNode;
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** Field label for assistive tech ("Study guide title"). */
  label: string;
  /** Classes for the field — match the rendered text's size so nothing jumps. */
  inputClassName?: string;
  className?: string;
}

export function EditInPlaceText({
  value,
  canEdit,
  write,
  children,
  editing: editingProp,
  onEditingChange,
  label,
  inputClassName,
  className,
}: EditInPlaceTextProps) {
  const [editingState, setEditingState] = useState(false);
  const editing = canEdit && (editingProp ?? editingState);
  const setEditing = (next: boolean) => {
    if (editingProp === undefined) setEditingState(next);
    onEditingChange?.(next);
  };
  const [caretAt, setCaretAt] = useState<number | null>(null);

  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    const sel = window.getSelection();
    // The double-clicked word's start is where the caret goes.
    const at = sel && sel.anchorNode && event.currentTarget.contains(sel.anchorNode) ? textOffset(event.currentTarget, sel.anchorNode, sel.anchorOffset) : null;
    sel?.removeAllRanges();
    setCaretAt(at);
    setEditing(true);
  };

  if (editing) {
    return (
      <InlineField
        value={value}
        write={write}
        label={label}
        caretAt={caretAt}
        className={cn(inputClassName, className)}
        close={() => {
          setCaretAt(null);
          setEditing(false);
        }}
      />
    );
  }
  return (
    <div
      data-edit-in-place={canEdit ? "read" : "off"}
      onDoubleClick={canEdit ? onDoubleClick : undefined}
      className={cn(canEdit && "cursor-text", className)}
    >
      {children}
    </div>
  );
}

function textOffset(root: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function InlineField({
  value,
  write,
  label,
  caretAt,
  className,
  close,
}: {
  value: string;
  write: (text: string) => Promise<unknown> | unknown;
  label: string;
  caretAt: number | null;
  className?: string;
  close: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [session] = useState(() => createInPlaceSession({ openedOn: value, mode: "explicit", write: async (t) => void (await write(t)) }));
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  // Set BEFORE the discard dialog takes focus, so the field's blur never saves.
  const confirming = useRef(false);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    const at = caretAt ?? el.value.length;
    el.setSelectionRange(at, at);
  }, [caretAt]);

  const save = async () => {
    if (done.current || saving) return;
    const text = draft.trim() === "" ? value : draft;
    setSaving(true);
    try {
      await session.save(text);
      done.current = true;
      close();
    } finally {
      setSaving(false);
    }
  };
  const cancel = () => {
    if (draft !== value) {
      confirming.current = true;
      setConfirmDiscard(true);
    }
    else {
      done.current = true;
      close();
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  };

  return (
    <>
      <input
        ref={input}
        aria-label={label}
        value={draft}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (!confirming.current) void save();
        }}
        className={cn("w-full rounded-sm bg-transparent outline-none ring-1 ring-ring", className)}
      />
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={(open) => {
          setConfirmDiscard(open);
          if (!open && !done.current) {
            // Keep editing: back into the field.
            confirming.current = false;
            input.current?.focus();
          }
        }}
        title="Discard your edit?"
        description="The text stays exactly as it was saved."
        confirmLabel="Discard edit"
        cancelLabel="Keep editing"
        onConfirm={() => {
          done.current = true;
          close();
        }}
      />
    </>
  );
}
