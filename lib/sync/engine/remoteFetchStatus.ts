/**
 * lib/sync/engine/remoteFetchStatus.ts
 *
 * THE LOAD OUTCOME A SLICE CAN HEAR (2026-09-26).
 *
 * `invokeRemoteFetch` used to report only success (a REHYDRATE). A fetch that
 * threw, or answered "nothing", dispatched NOTHING — so a slice could not tell
 * "the person's saved record loaded" from "the read failed and you are looking
 * at built-in defaults". Every settings page rendered those defaults as if they
 * were the person's choices: a screen that lies.
 *
 * Now every remote fetch announces its phases:
 *   - `started` — a fetch for this slice is in flight (cold boot, manual retry,
 *     or background refresh)
 *   - `empty`   — the source answered, and there is no saved record
 *   - `failed`  — the read threw (or its result could not be deserialized)
 * Success is still the REHYDRATE itself. A slice that cares handles this
 * action in `extraReducers`; slices that don't simply ignore it.
 *
 * Engine bookkeeping, never a user mutation: the middleware treats it like a
 * REHYDRATE and never persists or broadcasts because of it — a failed load
 * must never write the defaults back over the person's saved record.
 */

import type { FallbackContext, SyncActionMeta } from "../types";

export const REMOTE_FETCH_STATUS_ACTION_TYPE = "sync/remoteFetchStatus";

export type RemoteFetchPhase = "started" | "empty" | "failed";

export interface RemoteFetchStatusAction {
    type: typeof REMOTE_FETCH_STATUS_ACTION_TYPE;
    payload: {
        sliceName: string;
        phase: RemoteFetchPhase;
        reason: FallbackContext["reason"];
        /** The failure in words when `phase === "failed"`, else null. */
        error: string | null;
    };
    meta: SyncActionMeta;
    [extra: string]: unknown;
}

export function buildRemoteFetchStatusAction(
    sliceName: string,
    phase: RemoteFetchPhase,
    reason: FallbackContext["reason"],
    error: string | null = null,
): RemoteFetchStatusAction {
    return {
        type: REMOTE_FETCH_STATUS_ACTION_TYPE,
        payload: { sliceName, phase, reason, error },
        meta: { fromRehydrate: true },
    };
}

export function isRemoteFetchStatusAction(action: unknown): action is RemoteFetchStatusAction {
    return (
        action !== null &&
        typeof action === "object" &&
        (action as { type?: unknown }).type === REMOTE_FETCH_STATUS_ACTION_TYPE
    );
}

/** The part of a policy `announceLoadFailure` reads (any `Policy<T>` fits). */
interface LoadablePolicy {
    config: { sliceName: string; remote?: { fetch?: unknown } };
}

/**
 * A startup sync that THREW — boot, an identity resync, or anything they
 * await — must not leave a slice "loading" forever. Every slice that loads
 * from a remote source is told its load failed, with the error in words.
 * (A slice that already loaded keeps its record; the reducer decides.)
 */
export function announceLoadFailure(
    store: { dispatch: (action: RemoteFetchStatusAction) => unknown },
    policies: readonly LoadablePolicy[],
    error: string,
    reason: FallbackContext["reason"] = "cold-boot",
): void {
    for (const policy of policies) {
        if (!policy.config.remote?.fetch) continue;
        try {
            store.dispatch(
                buildRemoteFetchStatusAction(policy.config.sliceName, "failed", reason, error),
            );
        } catch {
            // A reducer that throws on its own failure notice cannot be told
            // any other way; the other slices still must be.
        }
    }
}
