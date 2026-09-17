"use client";

// features/masterwork/sitting/useDialogSitting.ts
//
// ONE CALL THAT MAKES A CAPTURE LANE SURVIVE A RELOAD.
//
// The story and the rule live in `./sitting.ts`. This is the React half: a
// lane hands it what is on screen, and gets back "it was put back, say so".
//
// Shape notes that matter:
//  * The read happens ONCE per activation (opening the dialog), never on every
//    render, so a person who deliberately clears the field is not fought by
//    their own storage.
//  * Writes are debounced and only happen while the lane is active AND the
//    snapshot is worth keeping — an empty form is not a sitting.
//  * `discard()` empties both the storage and the screen, because a notice
//    offering to throw work away that then leaves it on screen is a lie.
//  * Storage refusal degrades to `available: false` and never throws.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DialogSitting, SittingBase, SittingStore } from "./sitting";

const WRITE_DEBOUNCE_MS = 400;

export function useDialogSitting<T extends SittingBase>(opts: {
  /** The lane's own store, from `createSittingStore`. */
  store: SittingStore<T>;
  /** Usually the Rulebook id. Null means "nothing to scope to yet". */
  scopeId: string | null;
  /** Usually the dialog's `open`, or `true` for a whole page lane. */
  active: boolean;
  /** What is on screen right now. */
  snapshot: Omit<T, "savedAt">;
  /** Is there actually work here? An empty form is never a sitting. */
  isWorthKeeping: (snapshot: Omit<T, "savedAt">) => boolean;
  /** Put a kept sitting back on screen. Called at most once per activation. */
  apply: (sitting: T) => void;
  /** Wipe the screen back to empty — what `discard()` shows. */
  clearScreen: () => void;
}): DialogSitting {
  const { store, scopeId, active, snapshot, isWorthKeeping } = opts;
  const [resumed, setResumed] = useState(false);
  const [available, setAvailable] = useState(true);
  const appliedFor = useRef<string | null>(null);
  const latest = useRef(opts);
  latest.current = opts;

  // THE READ — once per activation, before anything is written back.
  useEffect(() => {
    if (!active || !scopeId) {
      if (!active) appliedFor.current = null;
      return;
    }
    if (appliedFor.current === scopeId) return;
    appliedFor.current = scopeId;
    let kept: T | null = null;
    try {
      kept = store.read(scopeId);
    } catch {
      setAvailable(false);
      return;
    }
    if (!kept) return;
    latest.current.apply(kept);
    setResumed(true);
  }, [active, scopeId, store]);

  // THE WRITE — debounced, only while the lane is live and holds real work.
  const worthKeeping = isWorthKeeping(snapshot);
  const serialized = JSON.stringify(snapshot);
  useEffect(() => {
    if (!active || !scopeId) return;
    if (appliedFor.current !== scopeId) return;
    const handle = setTimeout(() => {
      if (worthKeeping) store.write(scopeId, snapshot);
      else store.clear(scopeId);
    }, WRITE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // `serialized` is the real dependency: the snapshot object is rebuilt every
    // render, and depending on it directly would write on every keystroke's
    // render rather than on an actual change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, scopeId, serialized, worthKeeping, store]);

  const acknowledge = useCallback(() => setResumed(false), []);

  const discard = useCallback(() => {
    if (scopeId) store.clear(scopeId);
    latest.current.clearScreen();
    setResumed(false);
  }, [scopeId, store]);

  const forget = useCallback(() => {
    if (scopeId) store.clear(scopeId);
    setResumed(false);
  }, [scopeId, store]);

  return { resumed, acknowledge, discard, forget, available };
}
