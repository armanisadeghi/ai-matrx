"use client";

/**
 * phone-page-actions — where a route header's actions go on a phone.
 *
 * 🚨 ONE OVERFLOW BUTTON PER PHONE HEADER (page-pass shared defects,
 * 2026-09-27). Below 768px a record title lost ~200px to two overflow buttons —
 * the page's own "…" (RouteHeader's fold) and the shell's ⋮ — and
 * "Lankanewspapers.com Local" was cut to "La…". Now the shell's ⋮ sheet hosts
 * the page's actions as a labelled section at its top, and `RouteHeader`
 * renders none in the row. Pages declare their actions exactly as before.
 *
 * HOW, without losing a single action's React context: the sheet owns a
 * persistent DOM node (`host`) that lives in a hidden holder beside the ⋮
 * button; `RouteHeader` PORTALS its actions into it, so they stay mounted
 * inside the page's own tree (its providers, its open dialogs) whether the
 * sheet is open or not. While the sheet is open, the node is MOVED into the
 * sheet's section and moved back when it closes.
 */

import { useSyncExternalStore } from "react";

type State = { host: HTMLElement | null; count: number };

let state: State = { host: null, count: 0 };
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const SERVER: State = { host: null, count: 0 };

/** The shell's ⋮ publishes the node route actions portal into (null = no ⋮ mounted). */
export function setPhonePageActionsHost(host: HTMLElement | null): void {
  if (state.host === host) return;
  emit({ ...state, host });
}

const counts = new Map<string, number>();

/** A route header says how many actions it moved into the ⋮ (0 when it leaves). */
export function setPhonePageActionCount(owner: string, count: number): void {
  if (count > 0) counts.set(owner, count);
  else counts.delete(owner);
  let total = 0;
  for (const n of counts.values()) total += n;
  if (state.count === total) return;
  emit({ ...state, count: total });
}

export function usePhonePageActions(): State {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

/** Tests only. */
export function getPhonePageActionCountForTest(): number {
  return state.count;
}

/** Tests only. */
export function __resetPhonePageActionsForTest(): void {
  state = { host: null, count: 0 };
  counts.clear();
  listeners.clear();
}
