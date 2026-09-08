/**
 * engine.identityReset.test.ts — THE PERSONA SWAP.
 *
 * Regression for R-O3 (2026-09-08): signing in as a different person left the
 * PREVIOUS person's active organization on screen — an admin's shell announcing
 * "Working in content39's Workspace", an org he is not a member of.
 *
 * The cause was not in `appContext`. `rehydrateFromStorage` correctly REFUSES a
 * persisted record belonging to another identity, but refusing dispatches
 * nothing, so the outgoing person's slice state stayed live in Redux — and it
 * did so for every identity-scoped persisted slice at once. These tests drive
 * the real `resyncForIdentity` and the real root-reducer wrapper.
 */

import "fake-indexeddb/auto";
import { combineReducers, configureStore, createSlice } from "@reduxjs/toolkit";
import { resyncForIdentity } from "../engine/boot";
import { applyIdentityReset } from "../engine/identityReset";
import { definePolicy } from "../policies/define";
import { isRehydrateAction, type RehydrateAction } from "../engine/rehydrate";
import { clearAll, writeSlice } from "../persistence/idb";
import type { IdentityKey } from "../types";

const dana: IdentityKey = { type: "auth", userId: "dana", key: "auth:dana" };
const admin: IdentityKey = { type: "auth", userId: "admin", key: "auth:admin" };
const guest: IdentityKey = { type: "guest", fingerprintId: "fp", key: "guest:fp" };

interface OrgState {
    organization_id: string | null;
    organization_name: string | null;
}
const EMPTY: OrgState = { organization_id: null, organization_name: null };

/**
 * Stands in for `appContext`, INCLUDING the rehydrate guard that made this
 * unrecoverable on its own: "respect an org the user has already actively
 * selected this session". A leftover value looks exactly like a selection.
 */
function makeOrgSlice() {
    return createSlice({
        name: "appContext",
        initialState: EMPTY,
        reducers: {
            setOrganization: (state, action: { payload: OrgState }) => {
                state.organization_id = action.payload.organization_id;
                state.organization_name = action.payload.organization_name;
            },
        },
        extraReducers: (b) => {
            b.addMatcher(isRehydrateAction, (state, action: RehydrateAction) => {
                const p = action.payload as {
                    sliceName: string;
                    state: Partial<OrgState>;
                };
                if (p.sliceName !== "appContext") return;
                if (state.organization_id == null) {
                    state.organization_id = p.state.organization_id ?? null;
                    state.organization_name = p.state.organization_name ?? null;
                }
            });
        },
    });
}

function makeStore(identityScoped = true) {
    const policy = definePolicy<OrgState>({
        sliceName: "appContext",
        preset: "warm-cache",
        version: 1,
        identityScoped,
        broadcast: { actions: ["appContext/setOrganization"] },
        storageKey: "matrx:appContext",
    });
    const slice = makeOrgSlice();
    const combined = combineReducers({ appContext: slice.reducer });
    const store = configureStore({
        // The same wrapper `createSlimRootReducer` applies in the real app.
        reducer: (state, action) => combined(applyIdentityReset(state, action), action),
    });
    return { policy, store, slice };
}

beforeEach(async () => {
    window.localStorage.clear();
    await clearAll();
});

describe("a person's active organization does not survive a persona swap", () => {
    it("clears dana's org when admin signs in over her session", async () => {
        const { policy, store, slice } = makeStore();
        store.dispatch(
            slice.actions.setOrganization({
                organization_id: "content39-workspace",
                organization_name: "content39's Workspace",
            }),
        );
        expect(store.getState().appContext.organization_id).toBe(
            "content39-workspace",
        );

        await resyncForIdentity({
            store,
            identity: admin,
            previousIdentity: dana,
            policies: [policy],
            getIdentity: () => admin,
        });

        // Not dana's org, and not a guess at admin's either — nothing.
        expect(store.getState().appContext).toEqual(EMPTY);
    });

    it("restores the INCOMING person's own cached org, which the leftover value used to block", async () => {
        await writeSlice("auth:admin", "appContext", 1, {
            organization_id: "matrx-system",
            organization_name: "Matrx System",
        });
        const { policy, store, slice } = makeStore();
        store.dispatch(
            slice.actions.setOrganization({
                organization_id: "content39-workspace",
                organization_name: "content39's Workspace",
            }),
        );

        await resyncForIdentity({
            store,
            identity: admin,
            previousIdentity: dana,
            policies: [policy],
            getIdentity: () => admin,
        });

        expect(store.getState().appContext.organization_id).toBe("matrx-system");
    });

    it("clears on sign-out (auth -> guest) too", async () => {
        const { policy, store, slice } = makeStore();
        store.dispatch(
            slice.actions.setOrganization({
                organization_id: "content39-workspace",
                organization_name: "content39's Workspace",
            }),
        );

        await resyncForIdentity({
            store,
            identity: guest,
            previousIdentity: dana,
            policies: [policy],
            getIdentity: () => guest,
        });

        expect(store.getState().appContext).toEqual(EMPTY);
    });

    /**
     * THE CONTROL THAT COULD FAIL. `guest -> auth` is the ordinary page load —
     * a page renders anonymous and learns who you are ~100ms later. Resetting
     * there would wipe work started before signing in and would churn on every
     * single boot, so it must NOT reset.
     */
    it("does NOT reset on the ordinary anonymous-first-render boot", async () => {
        const { policy, store, slice } = makeStore();
        store.dispatch(
            slice.actions.setOrganization({
                organization_id: "picked-before-sign-in",
                organization_name: "Picked Before Sign In",
            }),
        );

        await resyncForIdentity({
            store,
            identity: admin,
            previousIdentity: guest,
            policies: [policy],
            getIdentity: () => admin,
        });

        expect(store.getState().appContext.organization_id).toBe(
            "picked-before-sign-in",
        );
    });

    /** A device preference (theme) opts out and must survive the swap. */
    it("leaves a slice that declared identityScoped:false alone", async () => {
        const { policy, store, slice } = makeStore(false);
        store.dispatch(
            slice.actions.setOrganization({
                organization_id: "device-preference",
                organization_name: "Device Preference",
            }),
        );

        await resyncForIdentity({
            store,
            identity: admin,
            previousIdentity: dana,
            policies: [policy],
            getIdentity: () => admin,
        });

        expect(store.getState().appContext.organization_id).toBe(
            "device-preference",
        );
    });
});

describe("applyIdentityReset", () => {
    it("returns the SAME object for every other action", () => {
        const state = { a: 1, b: 2 };
        expect(applyIdentityReset(state, { type: "anything/else" })).toBe(state);
    });

    it("only drops the slices it was told to, so unregistered slices keep their state", () => {
        const state = { appContext: { org: "x" }, somethingElse: { keep: true } };
        const next = applyIdentityReset(state, {
            type: "sync/identityReset",
            payload: {
                sliceNames: ["appContext"],
                fromIdentityKey: "auth:dana",
                toIdentityKey: "auth:admin",
            },
        });
        expect(next).not.toBe(state);
        expect("appContext" in (next as object)).toBe(false);
        expect((next as typeof state).somethingElse).toEqual({ keep: true });
    });
});

/**
 * The real registry must not accidentally opt slices out. `theme` is the only
 * legitimate `identityScoped: false` — anything else added to that list is a
 * person's data surviving a persona swap.
 */
describe("the shipped policy registry", () => {
    it("scopes every slice but theme to the person", async () => {
        const { syncPolicies } = await import("../registry");
        const optedOut = syncPolicies
            .filter((p) => p.config.identityScoped === false)
            .map((p) => p.config.sliceName);
        expect(optedOut).toEqual(["theme"]);
    });
});

/**
 * 🚨 THE GUARD THAT PROVES THE SHIPPED LAYER.
 *
 * Everything above builds its own store and calls `applyIdentityReset`
 * directly — which proves the function, and proves NOTHING about whether the
 * app's real reducer ever calls it. Deleting the wrapper from
 * `createSlimRootReducer` left every one of those tests green. That is the
 * recorded 2026-09-01 lesson repeating (guards green, wrong layer), so the real
 * reducer is driven here.
 */
describe("createSlimRootReducer (the shipped root reducer)", () => {
    it("honours the identity reset", async () => {
        const { createSlimRootReducer } = await import("@/lib/redux/rootReducer");
        const reducer = createSlimRootReducer();

        const signedIn = reducer(undefined, { type: "@@INIT" });
        const withOrg = reducer(signedIn, {
            type: "appContext/setOrganization",
            payload: { id: "content39-workspace", name: "content39's Workspace" },
        });
        expect(withOrg.appContext.organization_id).toBe("content39-workspace");

        const afterSwap = reducer(withOrg, {
            type: "sync/identityReset",
            payload: {
                sliceNames: ["appContext"],
                fromIdentityKey: "auth:dana",
                toIdentityKey: "auth:admin",
            },
        });
        expect(afterSwap.appContext.organization_id).toBeNull();
        expect(afterSwap.appContext.organization_name).toBeNull();
        // and it did not flatten the rest of the store
        expect(afterSwap.theme).toEqual(withOrg.theme);
    });
});
