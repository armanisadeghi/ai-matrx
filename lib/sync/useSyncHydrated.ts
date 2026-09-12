"use client";

// lib/sync/useSyncHydrated.ts
//
// "Has persisted state finished loading?" — the one honest answer.
//
// WHY (W43, 2026-09-12): a surface that restores something from the sync
// engine could not tell "nothing was saved" from "not read yet". The engine
// reads localStorage after React hydration, IndexedDB a turn later, and the
// SIGNED-IN person's records only on the identity resync that lands ~100ms
// after an anonymous first render. So for the first few hundred milliseconds
// every cache legitimately looks empty — and a surface that draws conclusions
// from that renders a confident lie. On /masterwork/new it rendered step 2 of
// the guided start with DEFAULT answers while the Expert's real ones were
// still in IndexedDB, and pressing Start created a Rulebook from the defaults.
//
// Use this anywhere "restored or not?" changes what the user sees. It NEVER
// hangs: if hydration has not settled inside `HYDRATION_BACKSTOP_MS` it
// screams and reports settled, because a surface stuck on a spinner forever is
// a worse failure than an honest "we could not find your saved answers".

import { useState, useSyncExternalStore } from "react";
import { useAppStore } from "@/lib/redux/hooks";

/** How long a surface waits for persisted hydration before giving up, loudly. */
export const HYDRATION_BACKSTOP_MS = 8000;

interface SyncSettledSource {
  hydrationSettled: () => boolean;
  onHydrationSettledChange: (listener: () => void) => () => void;
}

function readSyncSource(store: unknown): SyncSettledSource | null {
  const sync = (store as { _sync?: Partial<SyncSettledSource> } | null)?._sync;
  if (
    !sync ||
    typeof sync.hydrationSettled !== "function" ||
    typeof sync.onHydrationSettledChange !== "function"
  ) {
    return null;
  }
  return sync as SyncSettledSource;
}

/**
 * A tiny external store over the engine's settled signal, plus the backstop.
 * External-store shape on purpose: `useSyncExternalStore` is how React reads a
 * value that lives outside it, and it keeps this hook free of the
 * setState-in-an-effect cascade.
 */
interface SettledTracker {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
  /** SSR has no engine and nothing persisted — settled by definition. */
  getServerSnapshot: () => boolean;
}

function createSettledTracker(store: unknown): SettledTracker {
  const source = readSyncSource(store);
  // No engine (a test store, a non-app context): nothing to wait for.
  if (!source) {
    return {
      subscribe: () => () => {},
      getSnapshot: () => true,
      getServerSnapshot: () => true,
    };
  }
  let backstopFired = false;
  return {
    getSnapshot: () => backstopFired || source.hydrationSettled(),
    getServerSnapshot: () => true,
    subscribe: (onChange: () => void) => {
      const unsubscribe = source.onHydrationSettledChange(onChange);
      const backstop = globalThis.setTimeout(() => {
        if (source.hydrationSettled()) return;
        // LOUD: reaching here means the engine never finished reading
        // persisted state. Consumers stop waiting and show their honest empty
        // state rather than a spinner that never ends.
        console.error(
          `[sync] persisted hydration did not settle within ${HYDRATION_BACKSTOP_MS}ms — ` +
            "surfaces waiting on restored state will now show their empty state. " +
            "This is a defect in the sync engine's boot path, not a normal path.",
        );
        backstopFired = true;
        onChange();
      }, HYDRATION_BACKSTOP_MS);
      return () => {
        unsubscribe();
        globalThis.clearTimeout(backstop);
      };
    },
  };
}

/**
 * `true` once the sync engine has finished reading persisted state for the
 * CURRENT identity (or the backstop fired). A store without the engine — a
 * test store, a non-app context — is settled immediately: there is nothing
 * to wait for.
 */
export function useSyncHydrated(): boolean {
  const store = useAppStore();
  const [tracker] = useState(() => createSettledTracker(store));
  return useSyncExternalStore(
    tracker.subscribe,
    tracker.getSnapshot,
    tracker.getServerSnapshot,
  );
}
