// features/spaces/page/useRestoreKept.ts — a copy of the page kept on this device (page/unsaved.ts) goes
// back on the page once the page is ready for it.
//
// "Ready" arrives in pieces and in any order: the editor is built (the room's body is in it), the stored
// version is known, and the database answers that this person may edit (useAccess settles after the
// editor more often than not). The copy is decided exactly once per page, and only when every piece is
// there — a check that finds a piece missing waits for the next change instead of giving up (round 27,
// D1: the check ran once, while edit access was still loading, and the copy was never applied).
//
//   forget — the copy is what is stored: cleared (needs no access).
//   apply  — newer than what is stored: put back without a word.
//   ask    — someone else stored a newer version since: offered (Restore / Discard), never overwrites.

import { useEffect, useRef } from "react";

import { deviceStorage, forgetUnsaved, readUnsaved, restoreDecision, wroteVersion, type KeepStorage, type UnsavedCopy } from "./unsaved";

export interface RestoreKeptArgs {
  spaceId: string;
  /** The editor, once built with the room's body in it (null until then). */
  editor: unknown;
  /** This person may write the page now (access settled at edit or above, not in Trash). */
  canEdit: boolean;
  /** The stored version this page knows (null: not read yet). Read when the check runs. */
  stored: () => { key: string; version: number; archived: boolean } | null;
  /** Put the copy back on the page (it then saves like any edit). */
  apply: (copy: UnsavedCopy) => void;
  /** Someone stored a newer version: offer the copy with Restore and Discard. */
  offer: (copy: UnsavedCopy, actions: { restore: () => void; discard: () => void }) => void;
  storage?: () => KeepStorage | null;
}

export function useRestoreKept({ spaceId, editor, canEdit, stored, apply, offer, storage = deviceStorage }: RestoreKeptArgs): void {
  /** The page whose kept copy has been decided (applied, offered, forgotten, or found absent). */
  const decidedFor = useRef<string | null>(null);
  const latest = useRef({ stored, apply, offer, storage });
  latest.current = { stored, apply, offer, storage };

  useEffect(() => {
    if (!editor || decidedFor.current === spaceId) return;
    // A tick later: the room's body lands in the editor in the same turn the editor reports ready.
    const t = window.setTimeout(() => {
      if (decidedFor.current === spaceId) return;
      const { stored: readStored, apply: put, offer: ask, storage: getStorage } = latest.current;
      const box = getStorage();
      const copy = readUnsaved(box, spaceId);
      if (!copy) {
        decidedFor.current = spaceId;
        return;
      }
      const s = readStored();
      if (!s) return; // the stored version is not known yet: decided on the next change
      const decision = restoreDecision({ copy, stored: { key: s.key, version: s.version }, wrote: wroteVersion(box, spaceId) });
      if (decision === "forget") {
        forgetUnsaved(box, spaceId);
        decidedFor.current = spaceId;
        return;
      }
      // Edit access not answered yet (or a viewer, or in Trash): the copy stays on the device and is
      // decided when access arrives or the page is restored.
      if (!canEdit || s.archived) return;
      decidedFor.current = spaceId;
      if (decision === "apply") put(copy);
      else ask(copy, { restore: () => put(copy), discard: () => forgetUnsaved(box, spaceId) });
    }, 0);
    return () => window.clearTimeout(t);
  }, [spaceId, editor, canEdit]);
}
