/**
 * remote.fetch.test.ts — `invokeRemoteFetch` contract + stale scheduler.
 *
 * Contract (see phase-2-plan.md §5.3):
 *   - fetch returns Partial<TState> → engine dispatches REHYDRATE with fromRehydrate=true
 *   - fetch returns null → no dispatch
 *   - fetch throws → swallowed + logged; no dispatch
 *   - identity mid-flight change → response dropped (no dispatch)
 *   - external signal → aborted + no dispatch
 */

import "fake-indexeddb/auto";
import { configureStore, createSlice } from "@reduxjs/toolkit";
import { REHYDRATE_ACTION_TYPE, isRehydrateAction } from "../engine/rehydrate";
import type { RehydrateAction } from "../engine/rehydrate";
import {
    createStaleRefreshScheduler,
    invokeRemoteFetch,
} from "../engine/remoteFetch";
import { clearAll, readSlice } from "../persistence/idb";
import { definePolicy } from "../policies/define";
import type { IdentityKey } from "../types";

const identityA: IdentityKey = { type: "auth", userId: "u1", key: "auth:u1" };
const identityB: IdentityKey = { type: "auth", userId: "u2", key: "auth:u2" };

interface WarmState {
    value: string;
    loaded: boolean;
}

function makeSetup(fetchImpl: (ctx: {
    identity: IdentityKey;
    signal: AbortSignal;
    reason: "cold-boot" | "stale-refresh" | "manual";
}) => Promise<Partial<WarmState> | null>) {
    const dispatched: unknown[] = [];
    const slice = createSlice({
        name: "warm",
        initialState: { value: "initial", loaded: false } as WarmState,
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
    const store = configureStore({
        reducer: { warm: slice.reducer },
        middleware: (gDM) =>
            gDM().concat(() => (next) => (action) => {
                dispatched.push(action);
                return next(action);
            }),
    });
    const policy = definePolicy<WarmState>({
        sliceName: "warm",
        preset: "warm-cache",
        version: 1,
        broadcast: { actions: ["warm/set"] },
        remote: { fetch: fetchImpl },
    });
    return { store, policy, dispatched };
}

describe("invokeRemoteFetch", () => {
    it("dispatches REHYDRATE when fetch resolves with data", async () => {
        const { store, policy, dispatched } = makeSetup(async () => ({
            value: "from-server",
            loaded: true,
        }));
        await invokeRemoteFetch({
            policy,
            store,
            getIdentity: () => identityA,
            reason: "cold-boot",
        });
        const hit = dispatched.find(
            (a) => (a as { type?: string }).type === REHYDRATE_ACTION_TYPE,
        );
        expect(hit).toBeDefined();
        expect(store.getState().warm.value).toBe("from-server");
        expect(store.getState().warm.loaded).toBe(true);
    });

    it("does not dispatch when fetch resolves with null", async () => {
        const { store, policy, dispatched } = makeSetup(async () => null);
        await invokeRemoteFetch({
            policy,
            store,
            getIdentity: () => identityA,
            reason: "cold-boot",
        });
        expect(
            dispatched.find((a) => (a as { type?: string }).type === REHYDRATE_ACTION_TYPE),
        ).toBeUndefined();
        expect(store.getState().warm.value).toBe("initial");
    });

    it("swallows fetch errors without rejecting", async () => {
        const { store, policy, dispatched } = makeSetup(async () => {
            throw new Error("boom");
        });
        await expect(
            invokeRemoteFetch({
                policy,
                store,
                getIdentity: () => identityA,
                reason: "cold-boot",
            }),
        ).resolves.toBeUndefined();
        expect(
            dispatched.find((a) => (a as { type?: string }).type === REHYDRATE_ACTION_TYPE),
        ).toBeUndefined();
        expect(store.getState().warm.value).toBe("initial");
    });

    it("drops the response when identity changes mid-flight", async () => {
        let release: (() => void) | undefined;
        let liveIdentity = identityA;
        const { store, policy, dispatched } = makeSetup(async () => {
            // Hold the response open until the caller swaps identity.
            await new Promise<void>((resolve) => {
                release = () => resolve();
            });
            return { value: "stale", loaded: true };
        });
        const pending = invokeRemoteFetch({
            policy,
            store,
            getIdentity: () => liveIdentity,
            reason: "cold-boot",
        });
        liveIdentity = identityB;
        release?.();
        await pending;
        expect(
            dispatched.find((a) => (a as { type?: string }).type === REHYDRATE_ACTION_TYPE),
        ).toBeUndefined();
        expect(store.getState().warm.value).toBe("initial");
    });

    it("skips dispatch when an external signal aborts", async () => {
        const controller = new AbortController();
        let release: (() => void) | undefined;
        const { store, policy, dispatched } = makeSetup(async () => {
            await new Promise<void>((resolve) => {
                release = () => resolve();
            });
            return { value: "late", loaded: true };
        });
        const pending = invokeRemoteFetch({
            policy,
            store,
            getIdentity: () => identityA,
            reason: "cold-boot",
            externalSignal: controller.signal,
        });
        controller.abort();
        release?.();
        await pending;
        expect(
            dispatched.find((a) => (a as { type?: string }).type === REHYDRATE_ACTION_TYPE),
        ).toBeUndefined();
    });

    it("short-circuits when externalSignal is already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        const fetchSpy = jest.fn(async () => ({ value: "never", loaded: true }));
        const policy = definePolicy<WarmState>({
            sliceName: "warm",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["warm/set"] },
            remote: { fetch: fetchSpy },
        });
        const slice = createSlice({
            name: "warm",
            initialState: { value: "initial", loaded: false } as WarmState,
            reducers: {},
        });
        const store = configureStore({ reducer: { warm: slice.reducer } });
        await invokeRemoteFetch({
            policy,
            store,
            getIdentity: () => identityA,
            reason: "cold-boot",
            externalSignal: controller.signal,
        });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("warms IDB + localStorage fallback mirror after a successful warm-cache fetch", async () => {
        // Reproduces Arman's Phase 2 §3.3 regression: a cold boot (IDB empty,
        // no LS fallback, no peer) triggered remote.fetch, which correctly
        // dispatched REHYDRATE — but the middleware deliberately skips
        // persist on REHYDRATE, so the next reload cold-fetched AGAIN. The
        // fix: after a successful fetch, `invokeRemoteFetch` writes the
        // original body directly to IDB + LS mirror (bypassing middleware).
        window.localStorage.clear();
        await clearAll();
        const { store, policy } = makeSetup(async () => ({
            value: "from-server",
            loaded: true,
        }));
        await invokeRemoteFetch({
            policy,
            store,
            getIdentity: () => identityA,
            reason: "cold-boot",
        });
        // REHYDRATE landed — slice state updated.
        expect(store.getState().warm.value).toBe("from-server");
        // IDB cache is warmed — next boot won't need to cold-fetch.
        const idbRecord = await readSlice("auth:u1", "warm", 1);
        expect(idbRecord).not.toBeNull();
        expect((idbRecord!.body as WarmState).value).toBe("from-server");
        // LS mirror (the localStorage fallback that kicks in when Dexie is
        // unavailable) is also populated.
        const lsMirror = window.localStorage.getItem("matrx:idbFallback:warm");
        expect(lsMirror).not.toBeNull();
        const parsed = JSON.parse(lsMirror!);
        expect(parsed.version).toBe(1);
        expect(parsed.identityKey).toBe("auth:u1");
        expect((parsed.body as WarmState).value).toBe("from-server");
    });

    it("persists the original body (not the post-deserialize state) so the cached shape round-trips through REHYDRATE on next boot", async () => {
        window.localStorage.clear();
        await clearAll();
        const dispatched: unknown[] = [];
        const slice = createSlice({
            name: "warm",
            initialState: { value: "initial", loaded: false } as WarmState,
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
        const store = configureStore({
            reducer: { warm: slice.reducer },
            middleware: (gDM) =>
                gDM().concat(() => (next) => (action) => {
                    dispatched.push(action);
                    return next(action);
                }),
        });
        const policy = definePolicy<WarmState>({
            sliceName: "warm",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["warm/set"] },
            deserialize: (raw) => ({
                ...(raw as Partial<WarmState>),
                value: `deserialized:${(raw as WarmState).value}`,
            }),
            remote: { fetch: async () => ({ value: "raw", loaded: true }) },
        });
        await invokeRemoteFetch({
            policy,
            store,
            getIdentity: () => identityA,
            reason: "cold-boot",
        });
        // Redux saw the deserialized value…
        expect(store.getState().warm.value).toBe("deserialized:raw");
        // …but the IDB/LS cache stored the ORIGINAL body shape, so the next
        // boot's REHYDRATE → deserialize chain reproduces the same state.
        const idbRecord = await readSlice("auth:u1", "warm", 1);
        expect((idbRecord!.body as WarmState).value).toBe("raw");
        const lsMirror = JSON.parse(
            window.localStorage.getItem("matrx:idbFallback:warm")!,
        );
        expect((lsMirror.body as WarmState).value).toBe("raw");
    });

    it("does NOT write to IDB when the fetch returns null", async () => {
        window.localStorage.clear();
        await clearAll();
        const { store, policy } = makeSetup(async () => null);
        await invokeRemoteFetch({
            policy,
            store,
            getIdentity: () => identityA,
            reason: "cold-boot",
        });
        expect(await readSlice("auth:u1", "warm", 1)).toBeNull();
        expect(window.localStorage.getItem("matrx:idbFallback:warm")).toBeNull();
        void store;
    });

    it("applies policy.deserialize before dispatching", async () => {
        const dispatched: unknown[] = [];
        const slice = createSlice({
            name: "warm",
            initialState: { value: "initial", loaded: false } as WarmState,
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
        const store = configureStore({
            reducer: { warm: slice.reducer },
            middleware: (gDM) =>
                gDM().concat(() => (next) => (action) => {
                    dispatched.push(action);
                    return next(action);
                }),
        });
        const policy = definePolicy<WarmState>({
            sliceName: "warm",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["warm/set"] },
            deserialize: (raw) => ({
                ...(raw as Partial<WarmState>),
                value: `deserialized:${(raw as WarmState).value}`,
            }),
            remote: { fetch: async () => ({ value: "raw", loaded: true }) },
        });
        await invokeRemoteFetch({
            policy,
            store,
            getIdentity: () => identityA,
            reason: "cold-boot",
        });
        expect(store.getState().warm.value).toBe("deserialized:raw");
    });
});

describe("createStaleRefreshScheduler", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("arms a timer per eligible policy and fires invokeRemoteFetch on elapsed", async () => {
        const calls: string[] = [];
        const policy = definePolicy<WarmState>({
            sliceName: "warm",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["warm/set"] },
            staleAfter: 5000,
            remote: {
                fetch: async () => {
                    calls.push("fetch");
                    return null;
                },
            },
        });
        const slice = createSlice({
            name: "warm",
            initialState: { value: "initial", loaded: false } as WarmState,
            reducers: {},
        });
        const store = configureStore({ reducer: { warm: slice.reducer } });

        const reg = createStaleRefreshScheduler([policy], store, () => identityA);
        expect(calls).toHaveLength(0);
        jest.advanceTimersByTime(5000);
        // Drain the microtask queue after timer fires.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        expect(calls).toHaveLength(1);

        reg.cancelAll();
    });

    it("skips policies without staleAfter or without remote.fetch", async () => {
        const missedFetch: string[] = [];
        const noStale = definePolicy<WarmState>({
            sliceName: "no-stale",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["x"] },
            remote: { fetch: async () => { missedFetch.push("no-stale"); return null; } },
        });
        const slice = createSlice({
            name: "no-stale",
            initialState: { value: "initial", loaded: false } as WarmState,
            reducers: {},
        });
        const store = configureStore({ reducer: { "no-stale": slice.reducer } });
        const reg = createStaleRefreshScheduler([noStale], store, () => identityA);
        jest.advanceTimersByTime(60_000);
        await Promise.resolve();
        expect(missedFetch).toHaveLength(0);
        reg.cancelAll();
    });

    it("cancelAll clears pending timers", async () => {
        const calls: string[] = [];
        const policy = definePolicy<WarmState>({
            sliceName: "warm",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["x"] },
            staleAfter: 1000,
            remote: { fetch: async () => { calls.push("fetch"); return null; } },
        });
        const slice = createSlice({
            name: "warm",
            initialState: { value: "initial", loaded: false } as WarmState,
            reducers: {},
        });
        const store = configureStore({ reducer: { warm: slice.reducer } });
        const reg = createStaleRefreshScheduler([policy], store, () => identityA);
        reg.cancelAll();
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
        expect(calls).toHaveLength(0);
    });
});
