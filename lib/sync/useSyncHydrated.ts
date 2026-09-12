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

import { useEffect, useState } from "react";
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
 * `true` once the sync engine has finished reading persisted state for the
 * CURRENT identity (or the backstop fired). A store without the engine — a
 * test store, a non-app context — is settled immediately: there is nothing
 * to wait for.
 */
export function useSyncHydrated(): boolean {
  const store = useAppStore();
  const [settled, setSettled] = useState(() => {
    const source = readSyncSource(store);
    return source ? source.hydrationSettled() : true;
  });

  useEffect(() => {
    const source = readSyncSource(store);
    if (!source) {
      setSettled(true);
      return;
    }
    if (source.hydrationSettled()) {
      setSettled(true);
      return;
    }
    setSettled(false);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setSettled(true);
    };
    const unsubscribe = source.onHydrationSettledChange(() => {
      if (source.hydrationSettled()) finish();
    });
    const backstop = globalThis.setTimeout(() => {
      if (done) return;
      // LOUD: reaching here means the engine never finished reading persisted
      // state. Consumers stop waiting and show their honest empty state.
      console.error(
        `[sync] persisted hydration did not settle within ${HYDRATION_BACKSTOP_MS}ms — ` +
          "surfaces waiting on restored state will now show their empty state. " +
          "This is a defect in the sync engine's boot path, not a normal path.",
      );
      finish();
    }, HYDRATION_BACKSTOP_MS);

    return () => {
      done = true;
      unsubscribe();
      globalThis.clearTimeout(backstop);
    };
  }, [store]);

  return settled;
}
