"use client";

// ─────────────────────────────────────────────────────────────────────────
// THE SAVE ADAPTER a rendered document may carry. A surface whose markdown
// is editable wraps its renderer in <MarkdownSourceEditProvider source save>;
// interactive constructs (task checkboxes today) then write their change
// back through the splice API (task-source.ts) and `save`. With no provider
// the same constructs render read-only — honestly, never as a control that
// looks live and does nothing.
// ─────────────────────────────────────────────────────────────────────────

import { createContext, useContext, type ReactNode } from "react";

export interface MarkdownSourceEdit {
  /** The stored source exactly as saved (not a render-prepared copy). */
  source: string;
  /** Persist a new source. May be async; a rejection is shown to the person. */
  save: (next: string) => void | Promise<void>;
}

const MarkdownSourceEditContext = createContext<MarkdownSourceEdit | null>(null);

export function MarkdownSourceEditProvider({
  source,
  save,
  children,
}: MarkdownSourceEdit & { children: ReactNode }) {
  return (
    <MarkdownSourceEditContext.Provider value={{ source, save }}>
      {children}
    </MarkdownSourceEditContext.Provider>
  );
}

export function useMarkdownSourceEdit(): MarkdownSourceEdit | null {
  return useContext(MarkdownSourceEditContext);
}

/**
 * The adapter for a level that can save only SOMETIMES (a streamed answer
 * saves once it has settled). It renders the same element either way, so
 * gaining or losing `save` never remounts the document below it — a remount
 * there unmounted every tool card at the instant a stream completed. With no
 * `save`, the outer adapter (if any) stays in effect, exactly as if this level
 * rendered nothing.
 */
export function OptionalMarkdownSourceEditProvider({
  source,
  save,
  children,
}: {
  source: string;
  save?: MarkdownSourceEdit["save"];
  children: ReactNode;
}) {
  const outer = useContext(MarkdownSourceEditContext);
  const value = save ? { source, save } : outer;
  return (
    <MarkdownSourceEditContext.Provider value={value}>
      {children}
    </MarkdownSourceEditContext.Provider>
  );
}
