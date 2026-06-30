/**
 * engine.middleware.warmCache.test.ts — middleware debounce branch
 * for `warm-cache` policies. Confirms:
 *   1. Debounced IDB write + localStorage mirror after quiescence.
 *   2. Remote write invoked once per coalesced burst.
 *   3. Rehydrate actions do NOT trigger a re-persist (echo loop guard).
 *   4. Identity swap mid-write cancels the in-flight.
 *
 * We use REAL timers with a short `defaultDebounceMs` (20ms) because Dexie +
 * fake-indexeddb chain multiple internal setImmediate + microtask stages per
 * write — Jest fake timers on top of that stack produce indeterministic drain
 * behavior.
 */

import "fake-indexeddb/auto";
import { configureStore, createSlice } from "@reduxjs/toolkit";
import { definePolicy } from "../policies/define";
import { createSyncMiddleware } from "../engine/middleware";
import { clearAll, readSlice } from "../persistence/idb";
import type { SyncChannel } from "../channel";
import type { IdentityKey } from "../types";
import type { SyncMessage } from "../messages";

function makeFakeChannel(): SyncChannel & { sent: SyncMessage[] } {
  const sent: SyncMessage[] = [];
  return {
    available: true,
    sent,
    post: (m) => void sent.push(m),
    subscribe: () => () => {},
    setIdentity: () => {},
    close: () => {},
  } as SyncChannel & { sent: SyncMessage[] };
}

const identityA: IdentityKey = { type: "auth", userId: "u1", key: "auth:u1" };
const identityB: IdentityKey = { type: "auth", userId: "u2", key: "auth:u2" };

interface WarmState {
  items: string[];
  counter: number;
}

const FAST_DEBOUNCE = 20;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createSyncMiddleware warm-cache branch", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await clearAll();
  });
  afterAll(() => window.localStorage.clear());

  it("debounces warm-cache writes to IDB + localStorage mirror", async () => {
    const remoteCalls: WarmState[] = [];
    const policy = definePolicy<WarmState>({
      sliceName: "warm",
      preset: "warm-cache",
      version: 1,
      broadcast: { actions: ["warm/push"] },
      remote: {
        write: async (ctx) => void remoteCalls.push(ctx.body as WarmState),
      },
    });

    const slice = createSlice({
      name: "warm",
      initialState: { items: [], counter: 0 } as WarmState,
      reducers: {
        push: (s, a: { type: string; payload: string }) => {
          s.items.push(a.payload);
          s.counter += 1;
        },
      },
    });

    const channel = makeFakeChannel();
    let liveIdentity = identityA;
    const store = configureStore({
      reducer: { warm: slice.reducer },
      middleware: (gDM) =>
        gDM().concat(
          createSyncMiddleware({
            policies: [policy],
            channel,
            getIdentity: () => liveIdentity,
            defaultDebounceMs: FAST_DEBOUNCE,
          }),
        ),
    });

    // Fire a burst of 3 mutations.
    store.dispatch({ type: "warm/push", payload: "a" });
    store.dispatch({ type: "warm/push", payload: "b" });
    store.dispatch({ type: "warm/push", payload: "c" });

    // Before debounce elapses — nothing persisted yet.
    expect(await readSlice("auth:u1", "warm", 1)).toBeNull();
    expect(window.localStorage.getItem("matrx:idbFallback:warm")).toBeNull();
    expect(remoteCalls).toHaveLength(0);

    await wait(FAST_DEBOUNCE + 40);

    const idbRecord = await readSlice("auth:u1", "warm", 1);
    expect(idbRecord).not.toBeNull();
    expect((idbRecord!.body as WarmState).items).toEqual(["a", "b", "c"]);

    const mirror = window.localStorage.getItem("matrx:idbFallback:warm");
    expect(mirror).not.toBeNull();
    expect(JSON.parse(mirror!).body.items).toEqual(["a", "b", "c"]);

    expect(remoteCalls).toHaveLength(1);
    expect(remoteCalls[0].items).toEqual(["a", "b", "c"]);

    // Channel broadcast still runs for each action in the allow-list (3 emits).
    expect(channel.sent).toHaveLength(3);
  });

  it("does not schedule a debounced write for rehydrate actions", async () => {
    const remoteCalls: unknown[] = [];
    const policy = definePolicy<WarmState>({
      sliceName: "warm",
      preset: "warm-cache",
      version: 1,
      broadcast: { actions: ["warm/push"] },
      remote: { write: async (ctx) => void remoteCalls.push(ctx.body) },
    });

    const slice = createSlice({
      name: "warm",
      initialState: { items: ["initial"], counter: 0 } as WarmState,
      reducers: {},
      extraReducers: (b) => {
        b.addCase("sync/rehydrate", (state, action: any) => {
          if (action.payload?.sliceName === "warm") {
            Object.assign(state, action.payload.state);
          }
        });
      },
    });

    const channel = makeFakeChannel();
    const store = configureStore({
      reducer: { warm: slice.reducer },
      middleware: (gDM) =>
        gDM().concat(
          createSyncMiddleware({
            policies: [policy],
            channel,
            getIdentity: () => identityA,
            defaultDebounceMs: FAST_DEBOUNCE,
          }),
        ),
    });

    store.dispatch({
      type: "sync/rehydrate",
      payload: {
        sliceName: "warm",
        state: { items: ["from-idb"], counter: 1 } as WarmState,
      },
      meta: { fromRehydrate: true },
    });

    // Generously longer than the debounce window — if a write was
    // (incorrectly) scheduled, it would have fired by now.
    await wait(FAST_DEBOUNCE + 80);

    expect(remoteCalls).toHaveLength(0);
    expect(await readSlice("auth:u1", "warm", 1)).toBeNull();
  });

  it("cancels in-flight remote.write when identity swaps", async () => {
    let inflightSignal: AbortSignal | null = null;
    let release: (() => void) | undefined;
    const remoteCalls: unknown[] = [];
    const policy = definePolicy<WarmState>({
      sliceName: "warm",
      preset: "warm-cache",
      version: 1,
      broadcast: { actions: ["warm/push"] },
      remote: {
        write: async (ctx) => {
          inflightSignal = ctx.signal;
          remoteCalls.push(ctx.body);
          await new Promise<void>((resolve) => {
            release = () => resolve();
          });
        },
      },
    });

    const slice = createSlice({
      name: "warm",
      initialState: { items: [], counter: 0 } as WarmState,
      reducers: {
        push: (s, a: { type: string; payload: string }) => {
          s.items.push(a.payload);
          s.counter += 1;
        },
      },
    });

    const channel = makeFakeChannel();
    let liveIdentity: IdentityKey = identityA;
    const store = configureStore({
      reducer: { warm: slice.reducer },
      middleware: (gDM) =>
        gDM().concat(
          createSyncMiddleware({
            policies: [policy],
            channel,
            getIdentity: () => liveIdentity,
            defaultDebounceMs: FAST_DEBOUNCE,
          }),
        ),
    });

    store.dispatch({ type: "warm/push", payload: "pre-swap" });
    await wait(FAST_DEBOUNCE + 40);
    expect(remoteCalls).toHaveLength(1);
    expect(inflightSignal!.aborted).toBe(false);

    // Swap identity — next dispatched action trips the middleware's
    // comparison and calls scheduler.onIdentitySwap().
    liveIdentity = identityB;
    store.dispatch({ type: "warm/push", payload: "post-swap" });
    expect(inflightSignal!.aborted).toBe(true);

    release?.();
    await wait(5);

    // The pending timer from the post-swap dispatch is fresh — wait
    // and confirm a NEW write fires under the new identity.
    await wait(FAST_DEBOUNCE + 40);
    expect(remoteCalls.length).toBeGreaterThanOrEqual(2);

    // Confirm IDB record is stamped with the new identity.
    const record = await readSlice("auth:u2", "warm", 1);
    expect(record).not.toBeNull();
  });

  it("does NOT schedule a debounced write when the first post-boot action leaves the slice reference unchanged", async () => {
    // Reproduces Arman's Phase 2 §3.1 bug: an SSR-preloaded warm-cache slice
    // triggered a debounced Supabase upsert on first reload because
    // `lastPersistedRef` was empty at boot — any first action (even one
    // that touched a DIFFERENT slice) flipped the `!==` check and the
    // slice was flushed back to remote unchanged.
    //
    // Fix: middleware seeds `lastPersistedRef` from preloadedState on the
    // first action, before `next(action)`. First non-REHYDRATE action
    // that leaves the slice state reference intact must not write.
    const remoteCalls: unknown[] = [];
    const policy = definePolicy<WarmState>({
      sliceName: "warm",
      preset: "warm-cache",
      version: 1,
      broadcast: { actions: ["other/ping"] },
      remote: { write: async (ctx) => void remoteCalls.push(ctx.body) },
    });

    const warmSlice = createSlice({
      name: "warm",
      initialState: { items: [], counter: 0 } as WarmState,
      reducers: {},
    });
    const otherSlice = createSlice({
      name: "other",
      initialState: { beep: 0 },
      reducers: {
        ping: (s) => {
          s.beep += 1;
        },
      },
    });

    const channel = makeFakeChannel();
    // Boot with a preloaded warm state — mirrors the SSR baseline that
    // `(a)/layout.tsx` injects via `getUserSessionData`.
    const store = configureStore({
      reducer: { warm: warmSlice.reducer, other: otherSlice.reducer },
      preloadedState: {
        warm: { items: ["seed"], counter: 7 } as WarmState,
        other: { beep: 0 },
      },
      middleware: (gDM) =>
        gDM().concat(
          createSyncMiddleware({
            policies: [policy],
            channel,
            getIdentity: () => identityA,
            defaultDebounceMs: FAST_DEBOUNCE,
          }),
        ),
    });

    // First post-boot action touches `other`, leaving `warm` state ref
    // intact. Before the fix, this tripped the warm write scheduler
    // because `lastPersistedRef.get("warm")` was `undefined`.
    store.dispatch({ type: "other/ping" });

    await wait(FAST_DEBOUNCE + 60);

    expect(remoteCalls).toHaveLength(0);
    expect(await readSlice("auth:u1", "warm", 1)).toBeNull();
    expect(window.localStorage.getItem("matrx:idbFallback:warm")).toBeNull();
  });

  it("refreshes the persisted baseline after REHYDRATE so a subsequent no-op action does not flush", async () => {
    // Second half of Arman's §3.1/§3.3 fix: once a REHYDRATE lands (from
    // IDB/LS/remote.fetch/peer), the newly-rehydrated slice state IS the
    // persistent baseline. If we didn't update `lastPersistedRef` on the
    // REHYDRATE path, the NEXT mutation would be compared against the
    // stale boot baseline (or worse, `undefined`) and spuriously flushed.
    const remoteCalls: unknown[] = [];
    const policy = definePolicy<WarmState>({
      sliceName: "warm",
      preset: "warm-cache",
      version: 1,
      broadcast: { actions: ["warm/push"] },
      remote: { write: async (ctx) => void remoteCalls.push(ctx.body) },
    });

    const slice = createSlice({
      name: "warm",
      initialState: { items: [], counter: 0 } as WarmState,
      reducers: {},
      extraReducers: (b) => {
        b.addCase("sync/rehydrate", (state, action: any) => {
          if (action.payload?.sliceName === "warm") {
            Object.assign(state, action.payload.state);
          }
        });
      },
    });
    const otherSlice = createSlice({
      name: "other",
      initialState: { beep: 0 },
      reducers: {
        ping: (s) => {
          s.beep += 1;
        },
      },
    });

    const channel = makeFakeChannel();
    const store = configureStore({
      reducer: { warm: slice.reducer, other: otherSlice.reducer },
      middleware: (gDM) =>
        gDM().concat(
          createSyncMiddleware({
            policies: [policy],
            channel,
            getIdentity: () => identityA,
            defaultDebounceMs: FAST_DEBOUNCE,
          }),
        ),
    });

    // Simulate a REHYDRATE arriving from (e.g.) remote.fetch cold-boot.
    store.dispatch({
      type: "sync/rehydrate",
      payload: {
        sliceName: "warm",
        state: { items: ["from-server"], counter: 1 } as WarmState,
      },
      meta: { fromRehydrate: true },
    });

    // Next action does not touch the warm slice. The warm ref is
    // unchanged from the post-REHYDRATE state, so nothing should flush.
    store.dispatch({ type: "other/ping" });

    await wait(FAST_DEBOUNCE + 60);

    expect(remoteCalls).toHaveLength(0);
    expect(await readSlice("auth:u1", "warm", 1)).toBeNull();
  });
});
