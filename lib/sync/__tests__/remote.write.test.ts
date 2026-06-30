/**
 * remote.write.test.ts — debounced write scheduler (warm-cache sink).
 *
 * The scheduler coordinates BOTH legs of a warm-cache write:
 *   1. IDB write (Dexie via `writeSlice`)
 *   2. localStorage `idbFallback` mirror
 *   3. policy.remote.write (optional)
 *
 * We intentionally use REAL timers here. Fake-indexeddb's internal scheduler
 * uses `setImmediate`, and Dexie chains multiple microtasks per write —
 * layering Jest's fake timers on top of that stack produced indeterministic
 * drain behavior. The scheduler exposes `defaultDebounceMs`, so we set it low
 * (20ms) and use small real waits to assert behavior. Policy-level
 * `debounceMs` is verified via a 120ms value and intermediate checks.
 */

import "fake-indexeddb/auto";
import { createRemoteWriteScheduler } from "../engine/remoteWrite";
import { clearAll, readSlice } from "../persistence/idb";
import { definePolicy } from "../policies/define";
import type { IdentityKey } from "../types";

const identity: IdentityKey = { type: "auth", userId: "u1", key: "auth:u1" };

interface FakeStore {
    getState: () => unknown;
    dispatch: (a: unknown) => unknown;
}

function fakeStore(): FakeStore {
    return { getState: () => ({}), dispatch: (a) => a };
}

/** Short debounce used by most tests so real-timer waits stay tiny. */
const FAST_DEBOUNCE = 20;

/** Wait (real clock) — enough for the FAST_DEBOUNCE + Dexie chain to settle. */
function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("remoteWrite scheduler", () => {
    beforeEach(async () => {
        window.localStorage.clear();
        await clearAll();
    });
    afterAll(() => window.localStorage.clear());

    it("writes to IDB + localStorage mirror on debounce flush (no remote.write)", async () => {
        const policy = definePolicy<{ v: number }>({
            sliceName: "slice1",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["slice1/set"] },
            // no remote.write — IDB-only slice
        });

        const scheduler = createRemoteWriteScheduler({
            policies: [policy],
            store: fakeStore() as never,
            getIdentity: () => identity,
            attachPageHide: () => () => {},
            defaultDebounceMs: FAST_DEBOUNCE,
        });

        scheduler.schedule("slice1", { v: 42 });
        // Debounce pending — nothing persisted yet.
        expect(await readSlice("auth:u1", "slice1", 1)).toBeNull();

        await wait(FAST_DEBOUNCE + 40);

        const record = await readSlice("auth:u1", "slice1", 1);
        expect(record).not.toBeNull();
        expect(record!.body).toEqual({ v: 42 });

        const mirror = window.localStorage.getItem("matrx:idbFallback:slice1");
        expect(mirror).not.toBeNull();
        expect(JSON.parse(mirror!)).toEqual({
            version: 1,
            identityKey: "auth:u1",
            body: { v: 42 },
        });

        scheduler.dispose();
    });

    it("coalesces multiple rapid schedule() calls into one remote.write", async () => {
        const writeCalls: unknown[] = [];
        const policy = definePolicy<{ v: number }>({
            sliceName: "slice1",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["slice1/set"] },
            remote: {
                write: async (ctx) => {
                    writeCalls.push(ctx.body);
                },
            },
        });

        const scheduler = createRemoteWriteScheduler({
            policies: [policy],
            store: fakeStore() as never,
            getIdentity: () => identity,
            attachPageHide: () => () => {},
            defaultDebounceMs: FAST_DEBOUNCE,
        });

        scheduler.schedule("slice1", { v: 1 });
        scheduler.schedule("slice1", { v: 2 });
        scheduler.schedule("slice1", { v: 3 });
        await wait(FAST_DEBOUNCE + 40);

        expect(writeCalls).toHaveLength(1);
        expect(writeCalls[0]).toEqual({ v: 3 });

        scheduler.dispose();
    });

    it("honours policy.remote.debounceMs override", async () => {
        const writeCalls: unknown[] = [];
        const POLICY_DEBOUNCE = 120;
        const policy = definePolicy<{ v: number }>({
            sliceName: "slice1",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["slice1/set"] },
            remote: {
                debounceMs: POLICY_DEBOUNCE,
                write: async (ctx) => {
                    writeCalls.push(ctx.body);
                },
            },
        });

        const scheduler = createRemoteWriteScheduler({
            policies: [policy],
            store: fakeStore() as never,
            getIdentity: () => identity,
            attachPageHide: () => () => {},
            // Default is much lower, but policy-level should still win.
            defaultDebounceMs: FAST_DEBOUNCE,
        });

        scheduler.schedule("slice1", { v: 1 });
        await wait(60); // half-way through policy debounce window
        expect(writeCalls).toHaveLength(0); // still waiting

        await wait(POLICY_DEBOUNCE); // total ≈ 180ms, well past 120ms + Dexie
        expect(writeCalls).toHaveLength(1);
        expect(writeCalls[0]).toEqual({ v: 1 });

        scheduler.dispose();
    });

    it("aborts in-flight write when a new schedule lands", async () => {
        let receivedSignal: AbortSignal | null = null;
        let resolveWrite: () => void = () => {};
        const writeCalls: unknown[] = [];

        const policy = definePolicy<{ v: number }>({
            sliceName: "slice1",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["slice1/set"] },
            remote: {
                write: async (ctx) => {
                    receivedSignal = ctx.signal;
                    writeCalls.push(ctx.body);
                    // Keep the first call pending so re-schedule can abort it.
                    await new Promise<void>((resolve) => {
                        resolveWrite = () => {
                            resolve();
                        };
                    });
                },
            },
        });

        const scheduler = createRemoteWriteScheduler({
            policies: [policy],
            store: fakeStore() as never,
            getIdentity: () => identity,
            attachPageHide: () => () => {},
            defaultDebounceMs: FAST_DEBOUNCE,
        });

        scheduler.schedule("slice1", { v: 1 });
        await wait(FAST_DEBOUNCE + 40);
        expect(writeCalls).toEqual([{ v: 1 }]);
        expect(receivedSignal).not.toBeNull();
        expect(receivedSignal!.aborted).toBe(false);

        // Re-schedule while v:1 is in-flight.
        scheduler.schedule("slice1", { v: 2 });
        expect(receivedSignal!.aborted).toBe(true);

        // Let the first one resolve its promise; it was aborted so no extra writes.
        resolveWrite();
        await wait(5);

        // The new debounce fires the second write.
        await wait(FAST_DEBOUNCE + 40);
        expect(writeCalls.length).toBe(2);
        expect(writeCalls[1]).toEqual({ v: 2 });

        scheduler.dispose();
    });

    it("onIdentitySwap cancels all pending + in-flight writes", async () => {
        let seenAbort: AbortSignal | null = null;
        let inFlightResolve: () => void = () => {};
        const writeCalls: unknown[] = [];
        const policy = definePolicy<{ v: number }>({
            sliceName: "slice1",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["slice1/set"] },
            remote: {
                write: async (ctx) => {
                    seenAbort = ctx.signal;
                    writeCalls.push(ctx.body);
                    await new Promise<void>((resolve) => {
                        inFlightResolve = () => {
                            resolve();
                        };
                    });
                },
            },
        });

        const scheduler = createRemoteWriteScheduler({
            policies: [policy],
            store: fakeStore() as never,
            getIdentity: () => identity,
            attachPageHide: () => () => {},
            defaultDebounceMs: FAST_DEBOUNCE,
        });

        scheduler.schedule("slice1", { v: "original" });
        await wait(FAST_DEBOUNCE + 40);
        expect(writeCalls).toHaveLength(1);
        expect(seenAbort!.aborted).toBe(false);

        scheduler.onIdentitySwap();
        expect(seenAbort!.aborted).toBe(true);

        inFlightResolve();
        await wait(5);

        // No new writes should fire; the pending entry was wiped.
        await wait(FAST_DEBOUNCE + 40);
        expect(writeCalls).toHaveLength(1);

        scheduler.dispose();
    });

    it("flushAll triggers every pending slice immediately", async () => {
        const writeCalls: string[] = [];
        const sliceA = definePolicy<{ v: number }>({
            sliceName: "a",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["a/set"] },
            remote: { write: async () => void writeCalls.push("a") },
        });
        const sliceB = definePolicy<{ v: number }>({
            sliceName: "b",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["b/set"] },
            remote: { write: async () => void writeCalls.push("b") },
        });

        const scheduler = createRemoteWriteScheduler({
            policies: [sliceA, sliceB],
            store: fakeStore() as never,
            getIdentity: () => identity,
            attachPageHide: () => () => {},
            defaultDebounceMs: FAST_DEBOUNCE,
        });

        scheduler.schedule("a", { v: 1 });
        scheduler.schedule("b", { v: 1 });
        await scheduler.flushAll();

        expect(writeCalls.sort()).toEqual(["a", "b"]);

        scheduler.dispose();
    });

    it("pagehide (via attachPageHide hook) flushes pending writes", async () => {
        let hideFire: () => void = () => {};
        const writeCalls: unknown[] = [];
        const policy = definePolicy<{ v: number }>({
            sliceName: "slice1",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["slice1/set"] },
            remote: {
                write: async (ctx) => void writeCalls.push(ctx.body),
            },
        });

        const scheduler = createRemoteWriteScheduler({
            policies: [policy],
            store: fakeStore() as never,
            getIdentity: () => identity,
            attachPageHide: (handler) => {
                hideFire = () => {
                    handler();
                };
                return () => {};
            },
            defaultDebounceMs: FAST_DEBOUNCE,
        });

        scheduler.schedule("slice1", { v: 99 });
        // Simulate pagehide before debounce elapses.
        hideFire();
        // flushAll is fire-and-forget internally; give Dexie + awaits a moment.
        await wait(40);
        expect(writeCalls).toEqual([{ v: 99 }]);

        scheduler.dispose();
    });
});
