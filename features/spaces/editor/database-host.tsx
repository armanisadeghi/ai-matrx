"use client";

// features/spaces/editor/database-host.tsx — the element a database block's table lives in, and the
// rule that its presses and keys are the table's, never the page editor's.
//
// A DATABASE BLOCK IS ITS OWN APP INSIDE THE PAGE. ProseMirror listens natively on the editor element,
// so a click on a row became a block selection and the table's keys became the page's. The block used to
// answer that by stopping mousedown, keydown, paste, copy and cut natively on this element — which also
// kept them from React, whose listener sits above the editor: the grid never saw a press, so one click
// never selected a cell, and Enter, a second click and typing did nothing; only a double-click worked
// (lane CELL-EDITORS, 2026-10-06). Now the editor is told to leave those events alone
// (`handleDOMEvents` answering "handled" skips ProseMirror's own handling without stopping the event),
// and they travel on to the table.

import type { ReactNode } from "react";

/** The database block's own element: everything inside it is the table's. */
export const DATABASE_HOST_CLASS = "spaces-db-host";

/** Whether an event started inside a database block (a table living in the page). */
export function insideDatabaseBlock(event: Event): boolean {
  const target = event.target;
  return target instanceof Element && target.closest(`.${DATABASE_HOST_CLASS}`) !== null;
}

/** The events a table answers itself; ProseMirror's own handling of them is skipped inside the block. */
export const OWNED_BY_THE_TABLE = ["mousedown", "keydown", "keypress", "beforeinput", "paste", "copy", "cut"] as const;

/** ProseMirror `handleDOMEvents`: "handled" (skip the editor's own handling) for an event inside a database block. */
export const DATABASE_EVENT_CLAIMS: Record<(typeof OWNED_BY_THE_TABLE)[number], (view: unknown, event: Event) => boolean> = Object.fromEntries(
  OWNED_BY_THE_TABLE.map((kind) => [kind, (_view: unknown, event: Event) => insideDatabaseBlock(event)]),
) as Record<(typeof OWNED_BY_THE_TABLE)[number], (view: unknown, event: Event) => boolean>;

/** The block's element. It stops nothing: every press and key reaches the table and React above it. */
export function DatabaseHost({ children }: { children: ReactNode }) {
  return (
    <div className={DATABASE_HOST_CLASS} contentEditable={false}>
      {children}
    </div>
  );
}
