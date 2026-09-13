"use client";

import { useState } from "react";

/**
 * A RULEBOOK DIALOG SESSION — an open dialog belongs to ONE Rulebook.
 *
 * 🚨 Generalized and moved here 2026-09-13, on its THIRD occurrence. It was
 * written for the triage sort; `useIngestDialogSession` carries the same rule
 * with a lane attached; and the unfolding dialog then reproduced the defect a
 * third time because the primitive lived under `triage/` and read as triage's
 * own. Three copies of one rule is the point at which it stops being a
 * coincidence — so the rule lives here, once, and every per-Rulebook dialog
 * flag on the detail page comes through it.
 *
 * The original story, which is still the clearest statement of why:
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
 * `useIngestDialogSession` in `./liveIngestLane.ts`: the flag is
 * stored WITH the id it was opened for, and dropped during render the instant
 * they differ — React's sanctioned pattern for state derived from a prop. Not
 * merely hidden: a session that only FILTERED by id would match again when she
 * came back, and an empty dialog would reopen on its own.
 *
 * 🚨 THE OTHER HALF LIVES AT THE CALL SITE: the dialog is mounted with
 * `key={rulebook.id}`. Using this hook WITHOUT that key fixes only the
 * flag and leaves every one of the reasons below in place. It has to be a remount rather than an in-dialog reset,
 * because the form fields are not the only state that would carry over —
 * the run hook → `useDurableRun` rejoins its pointer ONCE per mount
 * (`rejoinedRef`) and never re-reads it when its key changes, so without the
 * remount a run on the Rulebook she LEFT would keep showing on the one she
 * arrived at, and the one actually running there would be invisible. On the
 * unfolding dialog that carry-over also holds a teaching case's resolution.
 */
export interface RulebookDialogSession {
  /** True only while the dialog is open FOR the Rulebook on screen. */
  open: boolean;
  setOpen: (next: boolean) => void;
}

export function useRulebookDialogSession(
  rulebookId: string | null,
): RulebookDialogSession {
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
