"use client";

/**
 * components/official/topic-tree/TopicTreeRenameInput.tsx — the in-place label
 * editor a row swaps in for F2 / activate.
 *
 * BLUR COMMITS, Esc CANCELS. That is Finder's and VS Code's contract and the
 * one users already have in their fingers: clicking away from a rename you
 * typed keeps it, because the alternative silently throws away work. Esc is the
 * explicit undo, and it must not also fire the blur commit on its way out —
 * hence the `cancelled` latch.
 */

import { useEffect, useRef, useState } from "react";

export interface TopicTreeRenameInputProps {
  value: string;
  maxLength?: number;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

export function TopicTreeRenameInput({
  value,
  maxLength,
  onCommit,
  onCancel,
}: TopicTreeRenameInputProps) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    if (cancelled.current) return;
    const next = draft.trim();
    // An empty name is not an edit — it is a deletion the rename box cannot
    // authorise. Falling back to `value` cancels rather than writing "".
    if (next.length === 0 || next === value) {
      onCancel();
      return;
    }
    onCommit(next);
  };

  return (
    <input
      ref={inputRef}
      value={draft}
      maxLength={maxLength}
      aria-label="Rename"
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onBlur={commit}
      onKeyDown={(event) => {
        // The tree owns ↑/↓/F2/Space; while an editor is open none of that may
        // reach it or typing a space would toggle a checkbox.
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancelled.current = true;
          onCancel();
        }
      }}
      className="min-w-0 flex-1 rounded-sm border border-primary/60 bg-background px-1 py-0 text-xs text-foreground outline-none"
    />
  );
}
