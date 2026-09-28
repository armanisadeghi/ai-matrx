/**
 * lib/sync/engine/remoteFetch.ts
 *
 * Invokes a policy's `remote.fetch` and (on success) dispatches a REHYDRATE
 * for the slice. Used on cold boot (when neither IDB nor a peer response
 * produced data), on `staleAfter` elapsed (background refresh), and from
 * `store._sync.refresh(sliceName)` in dev.
 *
 * Contract (see `phase-2-plan.md` §5.3):
 *   - Every fetch first dispatches `sync/remoteFetchStatus` phase `started`.
 *   - `fetch` returns Partial<TState> → engine rehydrates.
 *   - `fetch` returns null → state unchanged; phase `empty` dispatched.
 *   - `fetch` throws → caught + logged; state unchanged; phase `failed`
 *     dispatched with the error in words (see `remoteFetchStatus.ts`).
 *   - If identity changes mid-flight, AbortController is triggered and the
 *     response (should it arrive) is dropped.
 */

import type { Store } from "@reduxjs/toolkit";
import { extractErrorMessage } from "@/utils/errors";
// MATRX-EXCEPTION: `Policy<any>` throughout this file — same invariant-TState
// reason as lib/sync/registry.ts (partialize: readonly (keyof TState)[] makes
// TState invariant, so `Policy<unknown>` cannot accept the registry's
// heterogeneous `readonly Policy<any>[]`). Every use here only reads
// non-generic fields (config.sliceName/.version/.preset/.remote/.deserialize).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FallbackContext, IdentityKey, Policy } from "../types";
import { buildRehydrateAction } from "./rehydrate";
import { buildRemoteFetchStatusAction } from "./remoteFetchStatus";
import { logger } from "../logger";
import { writeSlice } from "../persistence/idb";
import { localStorageAdapter } from "../persistence/local-storage";
import { getPreset } from "../policies/presets";
import { isRemoteWritePending } from "./remoteWrite";

export interface InvokeRemoteFetchOptions {
    policy: Policy<any>;
    store: Store;
    getIdentity: () => IdentityKey;
    reason: "cold-boot" | "stale-refresh" | "manual";
    /** External abort signal (e.g., identity-swap watchdog). Optional. */
    externalSignal?: AbortSignal;
}

/**
 * Run one fetch. Resolves when complete (success, null, or error).
 * Never rejects — errors are swallowed and logged.
 */
export async function invokeRemoteFetch(opts: InvokeRemoteFetchOptions): Promise<void> {
    const { policy, store, getIdentity, reason, externalSignal } = opts;
    const fetchFn = policy.config.remote?.fetch;
    if (!fetchFn) return;

    const sliceName = policy.config.sliceName;
    // A background refresh never lands over unsaved edits: it would repaint
    // them with the server's older values. The write lands first; the next
    // refresh (timer or focus) reads the record with it.
    if (reason === "stale-refresh" && isRemoteWritePending(sliceName)) {
        logger.debug("fallback.deferred.pendingWrite", { sliceName });
        return;
    }

    const startIdentity = getIdentity();
    const controller = new AbortController();
    const abortOnExternal = () => controller.abort();
    if (externalSignal) {
        if (externalSignal.aborted) return;
        externalSignal.addEventListener("abort", abortOnExternal, { once: true });
    }

    const ctx: FallbackContext = {
        identity: startIdentity,
        signal: controller.signal,
        reason,
    };

    logger.debug("fallback.start", {
        sliceName: policy.config.sliceName,
        meta: { reason, identity: startIdentity.key },
    });

    store.dispatch(buildRemoteFetchStatusAction(sliceName, "started", reason));

    const started = typeof performance !== "undefined" ? performance.now() : 0;
    try {
        const result = await fetchFn(ctx);

        // Identity swapped mid-flight — drop.
        if (getIdentity().key !== startIdentity.key) {
            logger.debug("fallback.identity-changed", {
                sliceName: policy.config.sliceName,
            });
            return;
        }
        if (controller.signal.aborted) {
            logger.debug("fallback.aborted", { sliceName: policy.config.sliceName });
            return;
        }

        // Edited while the read was in flight: this answer predates the edit.
        if (reason === "stale-refresh" && isRemoteWritePending(sliceName)) {
            logger.debug("fallback.dropped.pendingWrite", { sliceName });
            return;
        }

        if (result == null) {
            logger.debug("fallback.empty", { sliceName: policy.config.sliceName });
            store.dispatch(buildRemoteFetchStatusAction(sliceName, "empty", reason));
            return;
        }

        // Honor policy.deserialize if present (same shape as boot rehydrate).
        let state: unknown = result;
        if (typeof policy.config.deserialize === "function") {
            try {
                state = policy.config.deserialize(result);
            } catch (err) {
                logger.error("fallback.deserialize.failed", {
                    sliceName: policy.config.sliceName,
                    meta: { error: extractErrorMessage(err) },
                });
                store.dispatch(
                    buildRemoteFetchStatusAction(sliceName, "failed", reason, extractErrorMessage(err)),
                );
                return;
            }
        }

        store.dispatch(
            buildRehydrateAction(policy.config.sliceName, state, { fromRehydrate: true }),
        );

        // Warm the local cache so the next boot is warm — writes landed via
        // `remote.fetch` only flow through REHYDRATE (which the middleware
        // deliberately skips for persist), so without this the next reload
        // cold-fetches the same data again. `warm-cache` tier only.
        //
        // We persist the ORIGINAL `result` body (not the post-deserialize
        // `state`), mirroring what the debounced write scheduler does when
        // a user mutation flushes: the serialized body shape is the policy's
        // stable contract, and round-tripping through the slice is the job of
        // the reducer's REHYDRATE case, not the persistence tier.
        //
        // GUARD: an INSUFFICIENT fetch result must never clobber the cache.
        // `remote.cacheSatisfies` is the policy's own definition of "this
        // record is an answer"; a result that fails it is the ABSENCE of an
        // answer (e.g. resolveActiveOrgContext's deliberate `organization_id:
        // null` nudge when a multi-org user has no default preference). The
        // REHYDRATE reducer already refuses to blank live Redux state on such
        // a result — but until this guard, the cache-warm below overwrote the
        // user's persisted selection with the hollow record, so every reload
        // booted org-less and nudged the user to pick again (the recurring
        // "my organization didn't stick" class).
        const satisfies = policy.config.remote?.cacheSatisfies;
        let resultSufficient = true;
        if (typeof satisfies === "function") {
            try {
                resultSufficient = satisfies(state) === true;
            } catch (err) {
                // A throwing predicate blocks the warm — never risk replacing
                // a good record on an undecidable answer.
                resultSufficient = false;
                logger.error("fallback.cacheSatisfies.threw", {
                    sliceName: policy.config.sliceName,
                    meta: { error: extractErrorMessage(err) },
                });
            }
        }
        const caps = getPreset(policy.config.preset);
        if (caps.storageTier === "idb" && !resultSufficient) {
            logger.info("fallback.cache.skipInsufficient", {
                sliceName: policy.config.sliceName,
                meta: { reason },
            });
        }
        if (caps.storageTier === "idb" && resultSufficient) {
            try {
                await writeSlice(
                    startIdentity.key,
                    policy.config.sliceName,
                    policy.config.version,
                    result,
                );
                localStorageAdapter.write(`matrx:idbFallback:${policy.config.sliceName}`, {
                    version: policy.config.version,
                    identityKey: startIdentity.key,
                    body: result,
                });
                logger.debug("fallback.cache.warmed", {
                    sliceName: policy.config.sliceName,
                    meta: { identity: startIdentity.key, reason },
                });
            } catch (err) {
                // Non-fatal — the data is already in Redux and will re-fetch
                // on next cold boot; only cache warming is impacted.
                logger.warn("fallback.cache.warm.failed", {
                    sliceName: policy.config.sliceName,
                    meta: { error: extractErrorMessage(err) },
                });
            }
        }

        const elapsed = typeof performance !== "undefined" ? performance.now() - started : 0;
        logger.info("fallback.complete", {
            sliceName: policy.config.sliceName,
            ms: elapsed,
            meta: { reason },
        });
    } catch (err) {
        logger.warn("fallback.error", {
            sliceName: policy.config.sliceName,
            meta: { error: extractErrorMessage(err), reason },
        });
        // Say it to the slice too — unless the read was superseded (identity
        // swapped / aborted), in which case the newer fetch owns the outcome.
        if (getIdentity().key === startIdentity.key && !controller.signal.aborted) {
            store.dispatch(
                buildRemoteFetchStatusAction(sliceName, "failed", reason, extractErrorMessage(err)),
            );
        }
    } finally {
        if (externalSignal) {
            externalSignal.removeEventListener("abort", abortOnExternal);
        }
    }
}

/**
 * Schedule stale-refresh timers for every `warm-cache` policy that declares
 * both `staleAfter` and `remote.fetch`. Returns a cleanup that cancels all
 * pending timers + any in-flight fetches.
 *
 * Callers:
 *   - `bootSync` calls this after initial rehydration lands, so the first
 *     refresh is timed relative to boot (not to last write).
 *   - On each successful `invokeRemoteFetch`, the caller should reset the
 *     timer by cancelling + re-arming.
 */
export interface StaleRefreshRegistration {
    resetFor(sliceName: string): void;
    cancelAll(): void;
}

/** A focus refresh fires at most this often per slice. */
export const REVALIDATE_ON_FOCUS_MIN_GAP_MS = 5_000;

export interface StaleRefreshSchedulerOptions {
    /** Test-only: subscribe to "the tab came back". Production uses visibilitychange + focus. */
    attachFocus?: (onFocus: () => void) => () => void;
    /** Test-only clock. */
    now?: () => number;
}

export function createStaleRefreshScheduler(
    policies: readonly Policy<any>[],
    store: Store,
    getIdentity: () => IdentityKey,
    options: StaleRefreshSchedulerOptions = {},
): StaleRefreshRegistration {
    const now = options.now ?? (() => Date.now());
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const lastRefreshAt = new Map<string, number>();
    const eligible = policies.filter(
        (p) => typeof p.config.staleAfter === "number" && !!p.config.remote?.fetch,
    );
    const bySlice = new Map(eligible.map((p) => [p.config.sliceName, p] as const));

    function refresh(sliceName: string): void {
        const policy = bySlice.get(sliceName);
        if (!policy) return;
        const existing = timers.get(sliceName);
        if (existing) clearTimeout(existing);
        timers.delete(sliceName);
        lastRefreshAt.set(sliceName, now());
        void invokeRemoteFetch({
            policy,
            store,
            getIdentity,
            reason: "stale-refresh",
        }).finally(() => arm(sliceName));
    }

    function arm(sliceName: string): void {
        const policy = bySlice.get(sliceName);
        if (!policy) return;
        const after = policy.config.staleAfter;
        if (typeof after !== "number") return;
        const existing = timers.get(sliceName);
        if (existing) clearTimeout(existing);
        const handle = setTimeout(() => refresh(sliceName), after);
        timers.set(sliceName, handle);
    }

    // Arm initial timers.
    for (const p of eligible) arm(p.config.sliceName);

    // --- Revalidate on focus (policy opt-in) ---
    const onFocusSlices = eligible
        .filter((p) => p.config.remote?.revalidateOnFocus === true)
        .map((p) => p.config.sliceName);
    function onFocus(): void {
        const t = now();
        for (const sliceName of onFocusSlices) {
            const last = lastRefreshAt.get(sliceName) ?? 0;
            if (t - last < REVALIDATE_ON_FOCUS_MIN_GAP_MS) continue;
            logger.debug("fallback.focus.revalidate", { sliceName });
            refresh(sliceName);
        }
    }
    let detachFocus: (() => void) | null = null;
    if (onFocusSlices.length > 0) {
        if (options.attachFocus) {
            detachFocus = options.attachFocus(onFocus);
        } else if (typeof window !== "undefined" && typeof document !== "undefined") {
            const onVisibility = () => {
                if (document.visibilityState === "visible") onFocus();
            };
            document.addEventListener("visibilitychange", onVisibility);
            window.addEventListener("focus", onFocus);
            detachFocus = () => {
                document.removeEventListener("visibilitychange", onVisibility);
                window.removeEventListener("focus", onFocus);
            };
        }
    }

    return {
        resetFor(sliceName) {
            if (bySlice.has(sliceName)) arm(sliceName);
        },
        cancelAll() {
            for (const h of timers.values()) clearTimeout(h);
            timers.clear();
            detachFocus?.();
            detachFocus = null;
        },
    };
}
