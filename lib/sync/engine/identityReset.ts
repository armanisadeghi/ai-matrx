/**
 * lib/sync/engine/identityReset.ts
 *
 * THE PERSONA-SWAP RESET.
 *
 * 🚨 WHY (2026-09-08, R-O3): every persisted sync record is stamped with an
 * `identityKey`, and `rehydrateFromStorage` correctly refuses one that belongs
 * to somebody else. But refusing is a `continue` — it dispatches NOTHING — so
 * when person B signs in over person A's session in the same tab, A's slice
 * state is never rehydrated *and never cleared*: it just stays live in Redux.
 *
 * On the deployed surface that read as an admin's shell announcing "Working in
 * content39's Workspace", an organization the admin is not a member of, with
 * the console's own create then honestly refusing him. The refusal was right;
 * the carried-over active organization was the defect. And appContext could not
 * even recover on its own — its rehydrate deliberately respects "an org the
 * user has already actively selected this session", which is exactly what A's
 * leftover value looks like.
 *
 * FIXED AT THE CLASS, NOT AT `appContext`. appContext is simply the slice where
 * it was visible; userPreferences, userProfile, wizardDraft and the scopes tree
 * all had the identical hole. So the engine returns EVERY identity-scoped
 * persisted slice to its initial state, in the ROOT REDUCER, where no slice has
 * to opt in and therefore no future slice can forget.
 *
 * WHEN IT FIRES: only when the OUTGOING identity was authenticated — person →
 * person, and person → signed out. `guest → auth` is the ordinary page load
 * (a page renders anonymous and learns who you are ~100ms later, see
 * `store.ts`); resetting there would wipe a draft someone started before
 * signing in and would churn on every single boot.
 */

import type { IdentityKey } from "../types";

export const IDENTITY_RESET_ACTION_TYPE = "sync/identityReset";

export interface IdentityResetAction {
    type: typeof IDENTITY_RESET_ACTION_TYPE;
    payload: {
        /** Slice names to return to `initialState`. */
        sliceNames: readonly string[];
        /** The identity being left behind — for logs, never for logic. */
        fromIdentityKey: string;
        /** The identity taking over. */
        toIdentityKey: string;
    };
    [extra: string]: unknown;
}

export function buildIdentityResetAction(
    sliceNames: readonly string[],
    from: IdentityKey,
    to: IdentityKey,
): IdentityResetAction {
    return {
        type: IDENTITY_RESET_ACTION_TYPE,
        payload: {
            sliceNames,
            fromIdentityKey: from.key,
            toIdentityKey: to.key,
        },
    };
}

export function isIdentityResetAction(
    action: unknown,
): action is IdentityResetAction {
    return (
        action !== null &&
        typeof action === "object" &&
        (action as { type?: unknown }).type === IDENTITY_RESET_ACTION_TYPE &&
        Array.isArray(
            (action as IdentityResetAction).payload?.sliceNames as unknown,
        )
    );
}

/**
 * Drop the named slices from the state object so `combineReducers` hands each
 * of their reducers `undefined` and gets `initialState` back. This is why no
 * slice needs an `extraReducers` case: a slice cannot opt out of being reset by
 * forgetting to handle an action it never sees.
 *
 * Returns the SAME object when nothing matches, so the wrapper stays free on
 * every other action.
 */
export function applyIdentityReset<S extends Record<string, unknown>>(
    state: S | undefined,
    action: unknown,
): S | undefined {
    if (state === undefined || !isIdentityResetAction(action)) return state;
    const { sliceNames } = action.payload;
    const present = sliceNames.filter((name) => name in state);
    if (present.length === 0) return state;
    const next = { ...state };
    for (const name of present) delete next[name];
    return next as S;
}
