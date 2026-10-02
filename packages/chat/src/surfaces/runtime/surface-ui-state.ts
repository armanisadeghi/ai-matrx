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

import { getSurfaceRuntimeStack } from "./SurfaceRuntimeContext";

type StoreKey = string;

const store = new Map<StoreKey, unknown>();

/**
 * Listeners are keyed by the BARE key, not `surface::key`.
 *
 * Both read forms must wake on any publication of a key: the exact-surface
 * form because its surface published, and the stack-walking form because a
 * DIFFERENT surface publishing can change which value wins. Keying listeners
 * by surface would leave the stack-walking reader asleep through exactly the
 * change it needs to see.
 */
const listeners = new Map<string, Set<() => void>>();

/** Stable per-key `subscribe` functions — a fresh closure each render would
 *  make `useSyncExternalStore` tear down and re-add its listener on every
 *  commit of every reading block. */
const subscribers = new Map<string, (listener: () => void) => () => void>();

const keyOf = (surfaceName: string, key: string): StoreKey =>
  `${surfaceName}::${key}`;

function emit(key: string): void {
  const set = listeners.get(key);
  if (!set) return;
  for (const listener of set) listener();
}

function subscriberFor(key: string): (listener: () => void) => () => void {
  const existing = subscribers.get(key);
  if (existing) return existing;
  const subscribe = (listener: () => void) => {
    let set = listeners.get(key);
    if (!set) {
      set = new Set();
      listeners.set(key, set);
    }
    set.add(listener);
    return () => {
      const current = listeners.get(key);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) listeners.delete(key);
    };
  };
  subscribers.set(key, subscribe);
  return subscribe;
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
  emit(key);
}

/** Imperative read of ONE surface's value — for non-React callers. */
export function readSurfaceUiState<T = unknown>(
  surfaceName: string,
  key: string,
): T | undefined {
  return store.get(keyOf(surfaceName, key)) as T | undefined;
}

/**
 * Imperative stack-walking read: the value from the DEEPEST mounted surface
 * that publishes `key`. This is the same resolution `applySurfaceWrite` uses
 * for targets — read and write MUST agree, or a block reads one surface's
 * state while its writes land on another's.
 */
export function readCurrentSurfaceUiState<T = unknown>(
  key: string,
): T | undefined {
  for (const runtime of getSurfaceRuntimeStack()) {
    const storeKey = keyOf(runtime.surfaceName, key);
    if (store.has(storeKey)) return store.get(storeKey) as T;
  }
  return undefined;
}

/**
 * Subscribe to ONE named surface's value. Returns `undefined` when that
 * surface is not publishing the key.
 *
 * Prefer `useCurrentSurfaceUiState` in a rendered block — a block must not
 * know which surface it landed on.
 */
export function useSurfaceUiState<T = unknown>(
  surfaceName: string,
  key: string,
): T | undefined {
  const storeKey = keyOf(surfaceName, key);
  return useSyncExternalStore(
    subscriberFor(key),
    () => store.get(storeKey) as T | undefined,
    // Server snapshot: nothing is published during SSR, and it must be the
    // SAME value every call or React throws an infinite-loop error.
    () => undefined,
  );
}

/**
 * Read a key from the mounted surface stack — deepest publisher wins, the same
 * resolution `applySurfaceWrite` uses for write targets.
 *
 * This is the form a rendered block wants: a block does not know, and must not
 * know, which page it landed on. It names a key; if a mounted surface is
 * publishing that key it gets a value, and if not (chat, a share page, SSR) it
 * gets `undefined` and renders its non-interactive form. Same key, same block,
 * every surface.
 *
 * It walks the stack rather than asking only the single deepest runtime,
 * because those are NOT the same surface: an overlay-hosted window registers
 * near the top of the tree (shallow depth) while the page behind it can be
 * nested deeper. Asking only the winner made a keyword window's blocks read
 * the content-plan node panel's (absent) state and silently render
 * non-interactive.
 */
export function useCurrentSurfaceUiState<T = unknown>(
  key: string,
): T | undefined {
  // Re-runs whenever any surface publishes this key. `getSurfaceRuntimeStack`
  // is read inside the snapshot so a mount/unmount is picked up on the next
  // notification or render — the same freshness contract as writeback.
  return useSyncExternalStore(
    subscriberFor(key),
    () => readCurrentSurfaceUiState<T>(key),
    () => undefined,
  );
}

/** Test/unmount cleanup. Never call from product code mid-session. */
export function clearSurfaceUiState(surfaceName?: string): void {
  const bareKey = (storeKey: string) => storeKey.split("::").slice(1).join("::");
  if (!surfaceName) {
    const keys = [...store.keys()];
    store.clear();
    for (const key of keys) emit(bareKey(key));
    return;
  }
  const prefix = `${surfaceName}::`;
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      emit(bareKey(key));
    }
  }
}
