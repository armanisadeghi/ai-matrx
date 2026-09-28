// features/notes/components/notesShellLayout.ts
//
// THE NOTES SIDEBAR SPLIT, REMEMBERED PER BREAKPOINT (page-pass /notes
// 2026-09-28). One cookie used to hold the split for every screen: the server
// renders the desktop group before `useIsMobile` settles, a phone squeezes it
// (180px minimum > 42% of 375px) until the sidebar collapses, that layout was
// persisted — and the next desktop visit opened with the sidebar gone. Now a
// phone never writes a split, and a laptop-width window keeps its own.

import type { Layout } from "react-resizable-panels";

export type NotesShellBucket = "wide" | "md";

/** Cookie per bucket. `wide` is new so a split a phone poisoned before this fix is not read. */
export const NOTES_SHELL_LAYOUT_COOKIE: Record<NotesShellBucket, string> = {
  wide: "panels:notes-shell:wide",
  md: "panels:notes-shell:md",
};

export type NotesShellLayouts = Partial<Record<NotesShellBucket, Layout>>;

/** The bucket a viewport width falls in; a phone (< 768px) has none — it never persists. */
export function notesShellBucket(width: number): NotesShellBucket | null {
  if (width >= 1280) return "wide";
  if (width >= 768) return "md";
  return null;
}

export function parseNotesShellLayout(raw: string | undefined): Layout | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Layout) : undefined;
  } catch {
    return undefined;
  }
}
