"use client";

/**
 * features/marketing/seo/topical-map/ui/TopicLabelEditor.tsx — the map's inline
 * name editor (CONTRACTS §4.3).
 *
 * Enter commits, Esc cancels, BLUR COMMITS — the same contract as
 * `components/official/topic-tree`'s editor and as Finder, because clicking
 * away from a name you just typed must not throw it away. An empty or
 * unchanged name cancels rather than writing: an empty topic name is a row
 * nobody can find again.
 */

import { useEffect, useRef, useState } from "react";

export interface TopicLabelEditorProps {
  value: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  maxLength?: number;
}

export function TopicLabelEditor({
  value,
  onCommit,
  onCancel,
  maxLength,
}: TopicLabelEditorProps) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function commit(): void {
    if (cancelled.current) return;
    const next = draft.trim();
    if (next.length === 0 || next === value) {
      onCancel();
      return;
    }
    onCommit(next);
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      maxLength={maxLength}
      aria-label="Topic name"
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={commit}
      onKeyDown={(event) => {
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
      className="w-full min-w-0 rounded-sm border border-primary/60 bg-background px-1.5 py-0.5 text-sm text-foreground outline-none"
    />
  );
}
