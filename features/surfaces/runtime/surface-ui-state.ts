"use client";

/**
 * features/surfaces/runtime/surface-ui-state.ts
 *
 * The READ twin of `surface-writeback.ts` — how a rendered block reads the
 * page's live interaction state.
 *
 * ## Why this exists
 *
 * The 360 loop needs both directions. The write direction shipped first
 * (`applySurfaceWrite`): a block names a declared target and the page applies
 * the value. The read direction had no synchronous channel:
 *
 *  - `getScope()` / `useLiveSurfaceScope` is a 400ms POLLER built for the
 *    Surface Context inspector. Polling per keystroke-scale interaction state
 *    is wrong for a component that must re-render the instant a checkbox
 *    flips.
 *  - Props cannot reach the block. Streamed content renders through
 *    `BlockRenderer`, which takes a block — not arbitrary caller props. That
 *    is deliberate (it is what keeps ONE renderer), and it is exactly why a
 *    surface previously had to fork its own renderer to get interactivity
 *    into streamed content. That fork is the banned pattern.
 *
 * So: one tiny module store, keyed `(surfaceName, key)`, read through
 * `useSyncExternalStore`. Same justification as `SurfaceRuntimeContext`'s
 * module registry — the publisher (the page, under `<main>`) and the readers
 * (blocks rendered deep inside the canonical pipeline, and chrome in the
 * header) are siblings that React context cannot span.
 *
 * ## What belongs here — and what does NOT
 *
 * ONLY ephemeral, page-owned INTERACTION state that a rendered block needs to
 * reflect: which rows are selected, which are disabled, what is focused or
 * expanded. It is a projection of state the page already owns.
 *
 * ❌ NOT a state store. Nothing is persisted, nothing is a source of truth,
 *    and nothing here may be the only copy of anything. The page owns the
 *    state (in Redux, per doctrine) and PUBLISHES a projection.
 * ❌ NOT domain data. Entity records, agent results, and form values travel
 *    their canonical paths.
 * ❌ NOT a way to pass callbacks. A block acts through
 *    `runAction("apply_surface_write", …)`, never a function smuggled here —
 *    that boundary is what keeps sandboxed, agent-authored components safe.
 *
 * Values MUST be structurally comparable (primitives, plain arrays/objects):
 * readers dedupe by identity, so publish a NEW value only when it changed.
 */

import { useSyncExternalStore } from "react";

import { useSurfaceRuntime } from "./SurfaceRuntimeContext";

type StoreKey = string;

const store = new Map<StoreKey, unknown>();
const listeners = new Map<StoreKey, Set<() => void>>();

const keyOf = (surfaceName: string, key: string): StoreKey =>
  `${surfaceName}::${key}`;

function emit(storeKey: StoreKey): void {
  const set = listeners.get(storeKey);
  if (!set) return;
  for (const listener of set) listener();
}

/**
 * Publish (or clear, with `undefined`) one piece of surface UI state.
 *
 * Call from the page that OWNS the state — typically in an effect mirroring
 * the state it already holds. Publishing an identical value is a no-op, so
 * calling this on every render is safe as long as the value is stable.
 */
export function publishSurfaceUiState(
  surfaceName: string,
  key: string,
  value: unknown,
): void {
  const storeKey = keyOf(surfaceName, key);
  if (store.get(storeKey) === value) return;
  if (value === undefined) {
    if (!store.has(storeKey)) return;
    store.delete(storeKey);
  } else {
    store.set(storeKey, value);
  }
  emit(storeKey);
}

/** Imperative read — for non-React callers (action handlers, chrome). */
export function readSurfaceUiState<T = unknown>(
  surfaceName: string,
  key: string,
): T | undefined {
  return store.get(keyOf(surfaceName, key)) as T | undefined;
}

/**
 * Subscribe to one piece of surface UI state. Returns `undefined` when the
 * surface is not mounted or has not published the key — a block MUST render
 * correctly in that case (it is the normal state in chat, where no surface
 * is publishing anything).
 */
export function useSurfaceUiState<T = unknown>(
  surfaceName: string,
  key: string,
): T | undefined {
  const storeKey = keyOf(surfaceName, key);
  return useSyncExternalStore(
    (listener) => {
      let set = listeners.get(storeKey);
      if (!set) {
        set = new Set();
        listeners.set(storeKey, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(storeKey);
      };
    },
    () => store.get(storeKey) as T | undefined,
    // Server snapshot: nothing is published during SSR, and it must be the
    // SAME value every call or React throws an infinite-loop error.
    () => undefined,
  );
}

/**
 * Read a key from whatever surface is CURRENTLY mounted (deepest wins — the
 * same resolution `applySurfaceWrite` uses for targets).
 *
 * This is the form a rendered block wants: a block does not know, and must not
 * know, which page it landed on. It names a key; if a surface is publishing
 * that key it gets a value, and if not (chat, a share page, SSR) it gets
 * `undefined` and renders its non-interactive form. Same key, same block,
 * every surface — that is what keeps ONE renderer.
 */
export function useCurrentSurfaceUiState<T = unknown>(
  key: string,
): T | undefined {
  const runtime = useSurfaceRuntime();
  return useSurfaceUiState<T>(runtime?.surfaceName ?? "", key);
}

/** Test/unmount cleanup. Never call from product code mid-session. */
export function clearSurfaceUiState(surfaceName?: string): void {
  if (!surfaceName) {
    const keys = [...store.keys()];
    store.clear();
    for (const key of keys) emit(key);
    return;
  }
  const prefix = `${surfaceName}::`;
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      emit(key);
    }
  }
}
