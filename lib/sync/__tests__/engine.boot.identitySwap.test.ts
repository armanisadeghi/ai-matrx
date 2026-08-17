/**
 * engine.boot.identitySwap.test.ts — `resyncForIdentity`.
 *
 * Regression for the org-selection-at-startup bug (2026-08-17): a page that
 * renders anonymous boots the engine as `guest:*`, and `usePublicAuthSync`
 * lands the real user ~100ms later. Until the identity swap re-ran the
 * identity-scoped half of boot, every `remote.fetch` gated on
 * `identity.type === "auth"` — the active organization's among them — stayed
 * permanently short-circuited for the tab, so a user with a starred default
 * organization booted with none selected and got nudged to pick one.
 */

import "fake-indexeddb/auto";
import { configureStore, createSlice } from "@reduxjs/toolkit";
import { bootSync, resyncForIdentity } from "../engine/boot";
import type { SyncChannel } from "../channel";
import { definePolicy } from "../policies/define";
import { isRehydrateAction, type RehydrateAction } from "../engine/rehydrate";
import { clearAll, writeSlice } from "../persistence/idb";
import type { IdentityKey } from "../types";

const guest: IdentityKey = { type: "guest", fingerprintId: "fp", key: "guest:fp" };
const authed: IdentityKey = { type: "auth", userId: "u1", key: "auth:u1" };

interface WarmState {
    items: readonly string[];
}

function makeSetup(
    fetch: (ctx: {
        identity: IdentityKey;
        signal: AbortSignal;
        reason: "cold-boot" | "stale-refresh" | "manual";
    }) => Promise<Partial<WarmState> | null>,
) {
    const policy = definePolicy<WarmState>({
        sliceName: "warm",
        preset: "warm-cache",
        version: 1,
        broadcast: { actions: ["warm/set"] },
        remote: { fetch },
    });
    const slice = createSlice({
        name: "warm",
        initialState: { items: [] } as WarmState,
        reducers: {},
        extraReducers: (b) => {
            b.addMatcher(isRehydrateAction, (state, action: RehydrateAction) => {
                const payload = action.payload as {
                    sliceName: string;
                    state: Partial<WarmState>;
                };
                if (payload.sliceName === "warm") Object.assign(state, payload.state);
            });
        },
    });
    return { policy, store: configureStore({ reducer: { warm: slice.reducer } }) };
}

describe("resyncForIdentity", () => {
    beforeEach(async () => {
        window.localStorage.clear();
        await clearAll();
    });
    afterAll(() => window.localStorage.clear());

    it("fetches for the new identity when it has no cache of its own", async () => {
        const seen: IdentityKey[] = [];
        const { policy, store } = makeSetup(async (ctx) => {
            seen.push(ctx.identity);
            return ctx.identity.type === "auth" ? { items: ["mine"] } : null;
        });

        await resyncForIdentity({
            store,
            identity: authed,
            policies: [policy],
            getIdentity: () => authed,
        });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(seen.map((i) => i.key)).toEqual(["auth:u1"]);
        expect(store.getState().warm.items).toEqual(["mine"]);
    });

    it("hydrates the new identity's cache instead of fetching", async () => {
        let fetchCalled = false;
        await writeSlice("auth:u1", "warm", 1, { items: ["cached"] });
        const { policy, store } = makeSetup(async () => {
            fetchCalled = true;
            return null;
        });

        await resyncForIdentity({
            store,
            identity: authed,
            policies: [policy],
            getIdentity: () => authed,
        });
        await Promise.resolve();
        await Promise.resolve();

        expect(store.getState().warm.items).toEqual(["cached"]);
        expect(fetchCalled).toBe(false);
    });

    it("drops its fetches when the identity swaps again mid-resync", async () => {
        let fetchCalled = false;
        const { policy, store } = makeSetup(async () => {
            fetchCalled = true;
            return { items: ["stale-identity"] };
        });

        // The live identity has already moved on past the one being resynced.
        await resyncForIdentity({
            store,
            identity: guest,
            policies: [policy],
            getIdentity: () => authed,
        });
        await Promise.resolve();
        await Promise.resolve();

        expect(fetchCalled).toBe(false);
    });

    // The other half of the swap: boot's own async IDB pass is still running
    // for the OUTGOING identity when the sign-in lands. Its late record must
    // not be dispatched over the signed-in session's state, and its cold-boot
    // fetches belong to the resync, not to boot.
    it("bootSync drops its late IDB pass when the identity swapped underneath it", async () => {
        let fetchCalled = false;
        await writeSlice("guest:fp", "warm", 1, { items: ["guest-cache"] });
        const { policy, store } = makeSetup(async () => {
            fetchCalled = true;
            return null;
        });
        const channel: SyncChannel = {
            available: false,
            post: () => {},
            subscribe: () => () => {},
            setIdentity: () => {},
            close: () => {},
        };

        const result = await bootSync({
            store,
            identity: guest,
            policies: [policy],
            openChannel: () => channel,
            // The store has already moved on to the signed-in user.
            getIdentity: () => authed,
        });
        expect(await result.idbHydration).toEqual([]);
        await Promise.resolve();
        await Promise.resolve();

        expect(store.getState().warm.items).toEqual([]);
        expect(fetchCalled).toBe(false);
        result.stale.cancelAll();
    });
});
