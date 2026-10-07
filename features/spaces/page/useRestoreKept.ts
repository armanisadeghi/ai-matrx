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
  /** The copy has been decided (applied, offered, forgotten): what waited behind it may save now. */
  onDecided?: () => void;
}

export interface RestoreKept {
  /**
   * A copy kept before this page opened still waits for its decision. Until it is decided the page
   * neither overwrites it (keepUnsaved) nor saves (a save that lands clears it): either would replace
   * the person's unsaved words with what is already stored (round 27: the host's first schedule wrote
   * the stored title over the kept one, and the check then found "nothing to restore").
   */
  awaiting: () => boolean;
}

export function useRestoreKept({ spaceId, editor, canEdit, stored, apply, offer, storage = deviceStorage, onDecided }: RestoreKeptArgs): RestoreKept {
  const latest = useRef({ stored, apply, offer, storage, onDecided });
  latest.current = { stored, apply, offer, storage, onDecided };
  /** Per page: did a kept copy exist when it opened, and is it still undecided. Read on first ask,
   *  before this page writes anything of its own to the device. */
  const kept = useRef<{ id: string; open: boolean } | null>(null);
  const awaiting = () => {
    if (kept.current?.id !== spaceId) kept.current = { id: spaceId, open: readUnsaved(latest.current.storage(), spaceId) !== null };
    return kept.current.open;
  };
  const decided = () => {
    kept.current = { id: spaceId, open: false };
    latest.current.onDecided?.();
  };

  useEffect(() => {
    if (!editor || !awaiting()) return;
    // A tick later: the room's body lands in the editor in the same turn the editor reports ready.
    const t = window.setTimeout(() => {
      if (!awaiting()) return;
      const { stored: readStored, apply: put, offer: ask, storage: getStorage } = latest.current;
      const box = getStorage();
      const copy = readUnsaved(box, spaceId);
      if (!copy) {
        decided();
        return;
      }
      const s = readStored();
      if (!s) return; // the stored version is not known yet: decided on the next change
      const decision = restoreDecision({ copy, stored: { key: s.key, version: s.version }, wrote: wroteVersion(box, spaceId) });
      if (decision === "forget") {
        forgetUnsaved(box, spaceId);
        decided();
        return;
      }
      // Edit access not answered yet (or a viewer, or in Trash): the copy stays on the device and is
      // decided when access arrives or the page is restored.
      if (!canEdit || s.archived) return;
      // Decided before applying: the apply is an edit, and an edit keeps and saves as usual.
      kept.current = { id: spaceId, open: false };
      if (decision === "apply") put(copy);
      else ask(copy, { restore: () => put(copy), discard: () => forgetUnsaved(box, spaceId) });
      latest.current.onDecided?.();
    }, 0);
    return () => window.clearTimeout(t);
    // awaiting / decided read refs only; the check re-runs when a piece of readiness arrives.
  }, [spaceId, editor, canEdit]);

  return { awaiting };
}
