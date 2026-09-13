"use client";

import { useState } from "react";

/**
 * THE TRIAGE DIALOG SESSION — a sort belongs to ONE Rulebook.
 *
 * The Rulebook detail page is ONE component instance reused across Rulebooks
 * (the route param changes; the page does not remount). So a bare
 * `useState(false)` for "is the sort dialog open" survived the navigation: the
 * Expert opened "Sort the drafts" on her surgery Rulebook, moved to her billing
 * Rulebook, and the sort dialog was still on screen — holding the purpose she
 * had typed for the FIRST one. Starting it there would have sorted the billing
 * drafts against the surgery purpose (Bugbot, 2026-09-13).
 *
 * This is the same rule, and deliberately the same shape, as
 * `useIngestDialogSession` in `../durable-run/liveIngestLane.ts`: the flag is
 * stored WITH the id it was opened for, and dropped during render the instant
 * they differ — React's sanctioned pattern for state derived from a prop. Not
 * merely hidden: a session that only FILTERED by id would match again when she
 * came back, and an empty dialog would reopen on its own.
 *
 * The other half lives at the call site: the dialog is mounted with
 * `key={rulebook.id}`. It has to be a remount rather than an in-dialog reset,
 * because the form fields are not the only state that would carry over —
 * `useTriageRun` → `useDurableRun` rejoins its pointer ONCE per mount
 * (`rejoinedRef`) and never re-reads it when its key changes, so without the
 * remount a sort running on the Rulebook she LEFT would keep showing on the one
 * she arrived at, and the one actually running there would be invisible.
 */
export interface TriageDialogSession {
  /** True only while the dialog is open FOR the Rulebook on screen. */
  open: boolean;
  setOpen: (next: boolean) => void;
}

export function useTriageDialogSession(
  rulebookId: string | null,
): TriageDialogSession {
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (openedFor !== null && openedFor !== rulebookId) {
    setOpenedFor(null);
  }
  return {
    open: openedFor !== null && openedFor === rulebookId,
    setOpen: (next: boolean) => {
      setOpenedFor(next && rulebookId ? rulebookId : null);
    },
  };
}
