/**
 * lib/sync/engine/remoteFetch.ts
 *
 * Invokes a policy's `remote.fetch` and (on success) dispatches a REHYDRATE
 * for the slice. Used on cold boot (when neither IDB nor a peer response
 * produced data), on `staleAfter` elapsed (background refresh), and from
 * `store._sync.refresh(sliceName)` in dev.
 *
 * Contract (see `phase-2-plan.md` §5.3):
 *   - `fetch` returns Partial<TState> → engine rehydrates.
 *   - `fetch` returns null → engine leaves state as-is (no dispatch).
 *   - `fetch` throws → caught + logged; state unchanged.
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
import { logger } from "../logger";
import { writeSlice } from "../persistence/idb";
import { localStorageAdapter } from "../persistence/local-storage";
import { getPreset } from "../policies/presets";

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

        if (result == null) {
            logger.debug("fallback.empty", { sliceName: policy.config.sliceName });
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
        const caps = getPreset(policy.config.preset);
        if (caps.storageTier === "idb") {
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

export function createStaleRefreshScheduler(
    policies: readonly Policy<any>[],
    store: Store,
    getIdentity: () => IdentityKey,
): StaleRefreshRegistration {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const eligible = policies.filter(
        (p) => typeof p.config.staleAfter === "number" && !!p.config.remote?.fetch,
    );
    const bySlice = new Map(eligible.map((p) => [p.config.sliceName, p] as const));

    function arm(sliceName: string): void {
        const policy = bySlice.get(sliceName);
        if (!policy) return;
        const after = policy.config.staleAfter;
        if (typeof after !== "number") return;
        const existing = timers.get(sliceName);
        if (existing) clearTimeout(existing);
        const handle = setTimeout(() => {
            timers.delete(sliceName);
            void invokeRemoteFetch({
                policy,
                store,
                getIdentity,
                reason: "stale-refresh",
            }).finally(() => arm(sliceName));
        }, after);
        timers.set(sliceName, handle);
    }

    // Arm initial timers.
    for (const p of eligible) arm(p.config.sliceName);

    return {
        resetFor(sliceName) {
            if (bySlice.has(sliceName)) arm(sliceName);
        },
        cancelAll() {
            for (const h of timers.values()) clearTimeout(h);
            timers.clear();
        },
    };
}
