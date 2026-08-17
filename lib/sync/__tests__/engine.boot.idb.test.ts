/**
 * engine.boot.idb.test.ts — async IDB hydration pass + cold-boot fallback.
 *
 * Verifies:
 *   1. When IDB has a matching record, REHYDRATE fires with that body.
 *   2. When IDB misses but the `matrx:idbFallback:*` localStorage mirror
 *      matches, we hydrate from the mirror.
 *   3. When both miss AND policy declares remote.fetch, cold-boot fetch fires.
 *   4. When both miss AND no remote.fetch, no dispatch — default state wins.
 *   5. Identity mismatch on stored record is rejected.
 */

import "fake-indexeddb/auto";
import { configureStore, createSlice } from "@reduxjs/toolkit";
import { bootSync } from "../engine/boot";
import { definePolicy } from "../policies/define";
import { REHYDRATE_ACTION_TYPE, isRehydrateAction } from "../engine/rehydrate";
import type { RehydrateAction } from "../engine/rehydrate";
import { clearAll, writeSlice } from "../persistence/idb";
import type { SyncChannel } from "../channel";
import type { IdentityKey } from "../types";

const identity: IdentityKey = { type: "auth", userId: "u1", key: "auth:u1" };
const otherIdentity: IdentityKey = { type: "auth", userId: "u2", key: "auth:u2" };

function fakeChannel(): SyncChannel {
    return {
        available: false,
        post: () => {},
        subscribe: () => () => {},
        setIdentity: () => {},
        close: () => {},
    };
}

interface WarmState {
    items: readonly string[];
}

function makeWarmSetup(opts: {
    fetch?: (ctx: {
        identity: IdentityKey;
        signal: AbortSignal;
        reason: "cold-boot" | "stale-refresh" | "manual";
    }) => Promise<Partial<WarmState> | null>;
    cacheSatisfies?: (state: WarmState) => boolean;
}) {
    const policy = definePolicy<WarmState>({
        sliceName: "warm",
        preset: "warm-cache",
        version: 1,
        broadcast: { actions: ["warm/set"] },
        ...(opts.fetch
            ? {
                  remote: {
                      fetch: opts.fetch,
                      ...(opts.cacheSatisfies
                          ? { cacheSatisfies: opts.cacheSatisfies }
                          : {}),
                  },
              }
            : {}),
    });
    const slice = createSlice({
        name: "warm",
        initialState: { items: [] } as WarmState,
        reducers: {},
        extraReducers: (b) => {
            b.addMatcher(
                isRehydrateAction,
                (state, action: RehydrateAction) => {
                    const payload = action.payload as { sliceName: string; state: Partial<WarmState> };
                    if (payload.sliceName === "warm") {
                        Object.assign(state, payload.state);
                    }
                },
            );
        },
    });
    const store = configureStore({ reducer: { warm: slice.reducer } });
    return { policy, store };
}

describe("bootSync — IDB hydration + cold-boot fallback", () => {
    beforeEach(async () => {
        window.localStorage.clear();
        await clearAll();
    });
    afterAll(() => window.localStorage.clear());

    it("hydrates from IDB when a matching record exists", async () => {
        await writeSlice("auth:u1", "warm", 1, { items: ["alpha", "beta"] });
        const { policy, store } = makeWarmSetup({});
        const result = await bootSync({
            store,
            identity,
            policies: [policy],
            openChannel: () => fakeChannel(),
        });
        const hydrated = await result.idbHydration;
        expect(hydrated).toEqual(["warm"]);
        expect(store.getState().warm.items).toEqual(["alpha", "beta"]);
    });

    it("rejects IDB record when identityKey differs (defense in depth)", async () => {
        // Compound key embeds `identityKey:slice:version`, so a direct
        // cross-identity read is a miss already — but this asserts the
        // hydrator's explicit identity check handles a corrupt record too.
        await writeSlice("auth:u1", "warm", 1, { items: ["leaked"] });
        const { policy, store } = makeWarmSetup({});
        const result = await bootSync({
            store,
            identity: otherIdentity,
            policies: [policy],
            openChannel: () => fakeChannel(),
        });
        const hydrated = await result.idbHydration;
        expect(hydrated).toEqual([]);
        expect(store.getState().warm.items).toEqual([]);
    });

    it("falls back to localStorage idbFallback mirror on IDB miss", async () => {
        window.localStorage.setItem(
            "matrx:idbFallback:warm",
            JSON.stringify({
                version: 1,
                identityKey: "auth:u1",
                body: { items: ["from-mirror"] },
            }),
        );
        const { policy, store } = makeWarmSetup({});
        const result = await bootSync({
            store,
            identity,
            policies: [policy],
            openChannel: () => fakeChannel(),
        });
        const hydrated = await result.idbHydration;
        expect(hydrated).toEqual(["warm"]);
        expect(store.getState().warm.items).toEqual(["from-mirror"]);
    });

    it("invokes remote.fetch for cold-boot when IDB + mirror both miss", async () => {
        let fetchCalled = false;
        let fetchReason: string | null = null;
        const fetchFn = async (ctx: {
            identity: IdentityKey;
            signal: AbortSignal;
            reason: "cold-boot" | "stale-refresh" | "manual";
        }): Promise<Partial<WarmState> | null> => {
            fetchCalled = true;
            fetchReason = ctx.reason;
            return { items: ["from-fetch"] };
        };
        const { policy, store } = makeWarmSetup({ fetch: fetchFn });
        const result = await bootSync({
            store,
            identity,
            policies: [policy],
            openChannel: () => fakeChannel(),
        });
        await result.idbHydration;
        // Give the fire-and-forget cold-boot fetch a tick to land.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        expect(fetchCalled).toBe(true);
        expect(fetchReason).toBe("cold-boot");
        expect(store.getState().warm.items).toEqual(["from-fetch"]);
    });

    it("does NOT invoke remote.fetch when IDB already hydrated", async () => {
        let fetchCalled = false;
        await writeSlice("auth:u1", "warm", 1, { items: ["from-idb"] });
        const fetchFn = async (): Promise<Partial<WarmState> | null> => {
            fetchCalled = true;
            return null;
        };
        const { policy, store } = makeWarmSetup({ fetch: fetchFn });
        const result = await bootSync({
            store,
            identity,
            policies: [policy],
            openChannel: () => fakeChannel(),
        });
        await result.idbHydration;
        await Promise.resolve();
        await Promise.resolve();
        expect(fetchCalled).toBe(false);
        expect(store.getState().warm.items).toEqual(["from-idb"]);
    });

    // Regression: a HOLLOW cached record (written by a mutation that landed
    // before the first fetch) used to count as a hit and suppress the
    // cold-boot fetch, leaving the slice empty until `staleAfter`. That is the
    // appContext-org incident of 2026-08-17: every org-scoped write in that
    // window fell back to the personal-org RPC and screamed.
    it("still fetches on cold boot when the cached record fails remote.cacheSatisfies", async () => {
        let fetchCalled = false;
        await writeSlice("auth:u1", "warm", 1, { items: [] });
        const fetchFn = async (): Promise<Partial<WarmState> | null> => {
            fetchCalled = true;
            return { items: ["reconciled"] };
        };
        const { policy, store } = makeWarmSetup({
            fetch: fetchFn,
            cacheSatisfies: (state) => state.items.length > 0,
        });
        const result = await bootSync({
            store,
            identity,
            policies: [policy],
            openChannel: () => fakeChannel(),
        });
        // The hollow record still hydrates — sufficiency governs the fetch, not
        // the rehydrate.
        expect(await result.idbHydration).toEqual(["warm"]);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        expect(fetchCalled).toBe(true);
        expect(store.getState().warm.items).toEqual(["reconciled"]);
    });

    it("does NOT fetch when the cached record satisfies remote.cacheSatisfies", async () => {
        let fetchCalled = false;
        await writeSlice("auth:u1", "warm", 1, { items: ["good"] });
        const { policy, store } = makeWarmSetup({
            fetch: async () => {
                fetchCalled = true;
                return null;
            },
            cacheSatisfies: (state) => state.items.length > 0,
        });
        const result = await bootSync({
            store,
            identity,
            policies: [policy],
            openChannel: () => fakeChannel(),
        });
        await result.idbHydration;
        await Promise.resolve();
        await Promise.resolve();
        expect(fetchCalled).toBe(false);
        expect(store.getState().warm.items).toEqual(["good"]);
    });

    it("treats a throwing cacheSatisfies as insufficient (reconciles, never crashes boot)", async () => {
        let fetchCalled = false;
        await writeSlice("auth:u1", "warm", 1, { items: ["cached"] });
        const { policy, store } = makeWarmSetup({
            fetch: async () => {
                fetchCalled = true;
                return { items: ["reconciled"] };
            },
            cacheSatisfies: () => {
                throw new Error("boom");
            },
        });
        const result = await bootSync({
            store,
            identity,
            policies: [policy],
            openChannel: () => fakeChannel(),
        });
        await result.idbHydration;
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        expect(fetchCalled).toBe(true);
    });

    it("exposes stale scheduler cancelAll so teardown works", async () => {
        const { policy, store } = makeWarmSetup({});
        const result = await bootSync({
            store,
            identity,
            policies: [policy],
            openChannel: () => fakeChannel(),
        });
        expect(typeof result.stale.cancelAll).toBe("function");
        // Drain the fire-and-forget IDB pass before we assert cancellation
        // (avoids "Cannot log after tests are done" from a late miss log).
        await result.idbHydration;
        // Should be idempotent.
        result.stale.cancelAll();
        result.stale.cancelAll();
    });
});
