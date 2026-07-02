/**
 * engine.boot.test.ts — synchronous boot, version gating, identity gating,
 * legacy-key migration.
 */

import { configureStore, createSlice } from "@reduxjs/toolkit";
import { bootSync } from "../engine/boot";
import { definePolicy } from "../policies/define";
import { REHYDRATE_ACTION_TYPE, isRehydrateAction } from "../engine/rehydrate";
import type { RehydrateAction } from "../engine/rehydrate";
import type { SyncChannel } from "../channel";
import type { IdentityKey } from "../types";

function seedLocalStorage(initial: Record<string, string> = {}): void {
    window.localStorage.clear();
    for (const [k, v] of Object.entries(initial)) window.localStorage.setItem(k, v);
}

function fakeChannel(): SyncChannel {
    return {
        available: false,
        post: () => {},
        subscribe: () => () => {},
        setIdentity: () => {},
        close: () => {},
    };
}

const identity: IdentityKey = { type: "auth", userId: "u", key: "auth:u" };

function makeThemeSetup() {
    const policy = definePolicy<{ mode: "light" | "dark" }>({
        sliceName: "theme",
        preset: "boot-critical",
        version: 1,
        broadcast: { actions: ["theme/setMode"] },
        deserialize: (raw) => {
            if (raw && typeof raw === "object" && (raw as { mode?: unknown }).mode === "light") {
                return { mode: "light" };
            }
            return { mode: "dark" };
        },
    });
    const dispatched: unknown[] = [];
    const slice = createSlice({
        name: "theme",
        initialState: { mode: "dark" as "light" | "dark" },
        reducers: {},
        extraReducers: (b) => {
            b.addMatcher(
                isRehydrateAction,
                (state, action: RehydrateAction) => {
                    const payload = action.payload as { sliceName: string; state: { mode: "light" | "dark" } };
                    if (payload.sliceName === "theme") state.mode = payload.state.mode;
                },
            );
        },
    });
    const store = configureStore({
        reducer: { theme: slice.reducer },
        middleware: (gDM) =>
            gDM().concat(() => (next: (action: unknown) => unknown) => (action: unknown) => {
                dispatched.push(action);
                return next(action);
            }),
    });
    return { policy, store, dispatched };
}

describe("bootSync", () => {
    beforeEach(() => window.localStorage.clear());
    afterAll(() => window.localStorage.clear());

    it("boots cleanly with empty storage (no rehydrate dispatched)", async () => {
        seedLocalStorage();
        const { policy, store, dispatched } = makeThemeSetup();
        const result = await bootSync({
            store,
            identity,
            policies: [policy],
            openChannel: () => fakeChannel(),
        });
        expect(result.hydratedFromStorage).toEqual([]);
        expect(dispatched.find((a) => (a as { type?: string }).type === REHYDRATE_ACTION_TYPE)).toBeUndefined();
    });

    it("rehydrates when stored version matches", async () => {
        seedLocalStorage({
            "matrx:theme": JSON.stringify({
                version: 1,
                identityKey: "auth:u",
                body: { mode: "light" },
            }),
        });
        const { policy, store } = makeThemeSetup();
        const result = await bootSync({
            store,
            identity,
            policies: [policy],
            openChannel: () => fakeChannel(),
        });
        expect(result.hydratedFromStorage).toEqual(["theme"]);
        expect(store.getState().theme.mode).toBe("light");
    });

    it("ignores rehydrate when stored version mismatches", async () => {
        seedLocalStorage({
            "matrx:theme": JSON.stringify({
                version: 99,
                identityKey: "auth:u",
                body: { mode: "light" },
            }),
        });
        const { policy, store } = makeThemeSetup();
        const result = await bootSync({
            store,
            identity,
            policies: [policy],
            openChannel: () => fakeChannel(),
        });
        expect(result.hydratedFromStorage).toEqual([]);
        // Default initial state retained.
        expect(store.getState().theme.mode).toBe("dark");
        // Mismatched record cleared.
        expect(window.localStorage.getItem("matrx:theme")).toBeNull();
    });

    it("ignores rehydrate when stored identity mismatches", async () => {
        seedLocalStorage({
            "matrx:theme": JSON.stringify({
                version: 1,
                identityKey: "auth:other",
                body: { mode: "light" },
            }),
        });
        const { policy, store } = makeThemeSetup();
        const result = await bootSync({
            store,
            identity,
            policies: [policy],
            openChannel: () => fakeChannel(),
        });
        expect(result.hydratedFromStorage).toEqual([]);
        expect(store.getState().theme.mode).toBe("dark");
    });

    it("migrates legacy 'theme' localStorage key to 'matrx:theme' and removes it", async () => {
        seedLocalStorage({ theme: "light" });
        const { policy, store } = makeThemeSetup();
        const result = await bootSync({
            store,
            identity,
            policies: [policy],
            openChannel: () => fakeChannel(),
        });
        expect(result.legacyMigrated).toBe(1);
        expect(window.localStorage.getItem("theme")).toBeNull();
        expect(window.localStorage.getItem("matrx:theme")).not.toBeNull();
        expect(result.hydratedFromStorage).toEqual(["theme"]);
        expect(store.getState().theme.mode).toBe("light");
    });
});
