/**
 * lib/sync/engine/boot.ts
 *
 * `bootSync(store, identity)` — invoked by `SyncBootstrap` in React's
 * post-hydration passive phase. Its localStorage phase dispatches synchronously
 * once invoked; peer hydration and IDB reads continue in the background.
 *
 * Never invoke this during a Provider render. Persisted state can change DOM
 * structure, which makes the first client tree differ from the server HTML and
 * triggers React hydration error #418. Pre-paint DOM-only concerns (theme)
 * belong to `SyncBootScript`, not Redux hydration.
 *
 * Lifecycle (awaited):
 *   1. Open the channel.
 *   2. One-shot legacy-key migration (theme only in Phase 1; list is explicit).
 *   3. For each boot-critical policy: read localStorage; if version + identity
 *      match, dispatch rehydrate with meta.fromRehydrate=true.
 *   4. Register channel message listener (translates inbound ACTION messages
 *      into local dispatches with meta.fromBroadcast=true).
 *   5. Resolve.
 *
 * Background (not awaited):
 *   - Broadcast HYDRATE_REQUEST for broadcast-enabled slices (peer hydration).
 */

import type { Store } from "@reduxjs/toolkit";
import { logger } from "../logger";
import { openSyncChannel, type SyncChannel } from "../channel";
import { localStorageAdapter, readLegacyKey, removeLegacyKey } from "../persistence/local-storage";
import { readSlice as readIdbSlice } from "../persistence/idb";
import { getPreset } from "../policies/presets";
import { buildRehydrateAction } from "./rehydrate";
import { createStaleRefreshScheduler, invokeRemoteFetch, type StaleRefreshRegistration } from "./remoteFetch";
import { extractErrorMessage } from "@/utils/errors";
import { setMode, type ThemeMode } from "@/styles/themes/themeSlice";
// MATRX-EXCEPTION: `Policy<any>` throughout this file — same invariant-TState
// reason as lib/sync/registry.ts (partialize: readonly (keyof TState)[] makes
// TState invariant, so `Policy<unknown>` cannot accept the registry's
// heterogeneous `readonly Policy<any>[]`). Every function here only reads
// non-generic fields (`policy.config.sliceName`, `.version`, `.preset`, …).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IdentityKey, Policy } from "../types";

/**
 * Legacy-key migrations. One-shot, executed inside `bootSync`. After Phase 1
 * every entry here is the pre-sync-engine localStorage key that the new engine
 * now owns. Adding to this list outside of a phase plan is a Constitution
 * violation.
 */
interface LegacyMigration {
    legacyKey: string;
    targetSliceName: string;
    /** Build the new record body from the raw legacy string value. Return null to skip. */
    migrate: (raw: string) => unknown | null;
}

export const LEGACY_MIGRATIONS: readonly LegacyMigration[] = [
    {
        legacyKey: "theme",
        targetSliceName: "theme",
        migrate: (raw) => (raw === "light" ? { mode: "light" } : { mode: "dark" }),
    },
];

export interface BootOptions {
    store: Store;
    identity: IdentityKey;
    policies: readonly Policy<any>[];
    /** Override for tests. Defaults to `openSyncChannel`. */
    openChannel?: (identity: IdentityKey) => SyncChannel;
    /**
     * Live identity getter. If omitted, defaults to `() => identity` (snapshot).
     * The store in production wires this through `store._sync.getIdentity` so
     * the stale-refresh scheduler + remote fetches see the current identity
     * after a swap without a fresh `bootSync` call.
     */
    getIdentity?: () => IdentityKey;
}

export interface BootResult {
    channel: SyncChannel;
    /** Keys of slices that rehydrated from localStorage. */
    hydratedFromStorage: readonly string[];
    /**
     * Resolves to the set of slice names rehydrated from IDB (and/or the
     * localStorage `idbFallback` mirror). Always resolves — never rejects.
     * Callers don't need to await this; it's exposed for tests + the demo.
     */
    idbHydration: Promise<readonly string[]>;
    /** Number of legacy migrations that ran. */
    legacyMigrated: number;
    /**
     * Stale-refresh scheduler for `warm-cache` policies. Call `cancelAll()`
     * on teardown (the browser store is a singleton, so this is rarely
     * needed — tests + SSR transitions are the main customers).
     */
    stale: StaleRefreshRegistration;
}

function runLegacyMigrations(policies: readonly Policy<any>[], identity: IdentityKey): number {
    let migrated = 0;
    const bySlice = new Map(policies.map((p) => [p.config.sliceName, p] as const));

    for (const m of LEGACY_MIGRATIONS) {
        const raw = readLegacyKey(m.legacyKey);
        if (raw == null) continue;
        const policy = bySlice.get(m.targetSliceName);
        if (!policy) continue;

        const body = m.migrate(raw);
        if (body == null) {
            removeLegacyKey(m.legacyKey);
            continue;
        }
        localStorageAdapter.write(policy.storageKey, {
            version: policy.config.version,
            identityKey: identity.key,
            body,
        });
        removeLegacyKey(m.legacyKey);
        migrated += 1;
        logger.info("boot.legacy.migrated", {
            sliceName: m.targetSliceName,
            meta: { legacyKey: m.legacyKey },
        });
    }
    return migrated;
}

function rehydrateFromStorage(
    policies: readonly Policy<any>[],
    identity: IdentityKey,
    store: Store,
): string[] {
    const hydrated: string[] = [];
    for (const policy of policies) {
        const caps = getPreset(policy.config.preset);
        if (!caps.persists) continue;
        const record = localStorageAdapter.read(policy.storageKey);
        if (!record) {
            logger.debug("boot.localStorage.miss", { sliceName: policy.config.sliceName });
            continue;
        }
        if (record.version !== policy.config.version) {
            logger.info("boot.localStorage.versionMismatch", {
                sliceName: policy.config.sliceName,
                meta: { got: record.version, want: policy.config.version },
            });
            localStorageAdapter.remove(policy.storageKey);
            continue;
        }
        if (record.identityKey !== identity.key) {
            logger.info("boot.localStorage.identityMismatch", {
                sliceName: policy.config.sliceName,
            });
            continue;
        }

        let state: unknown = record.body;
        if (typeof policy.config.deserialize === "function") {
            try {
                state = policy.config.deserialize(record.body);
            } catch (err) {
                logger.error("boot.deserialize.failed", {
                    sliceName: policy.config.sliceName,
                    meta: { error: extractErrorMessage(err) },
                });
                continue;
            }
        }
        store.dispatch(
            buildRehydrateAction(policy.config.sliceName, state, { fromRehydrate: true }),
        );
        hydrated.push(policy.config.sliceName);
        logger.debug("boot.localStorage.hit", { sliceName: policy.config.sliceName });
    }
    return hydrated;
}

/**
 * IDB hydration pass for `warm-cache` slices. Runs after the synchronous
 * localStorage pass has dispatched any boot-critical rehydrates, so first
 * paint is never blocked on this. If IDB itself is unavailable (private
 * browsing, Safari ITP, quota exhausted), we try the `matrx:idbFallback:*`
 * localStorage mirror written by `remoteWrite.ts` — the mirror is the
 * resilience tier for the IDB path.
 *
 * Returns the set of slice names that were successfully rehydrated.
 */
async function hydrateFromIdb(
    policies: readonly Policy<any>[],
    identity: IdentityKey,
    store: Store,
    alreadyHydrated: ReadonlySet<string>,
    getIdentity: () => IdentityKey,
): Promise<string[]> {
    const hydrated: string[] = [];
    // Each read is a turn of the event loop, so the identity can swap mid-pass
    // (sign-in lands ~100ms after an anonymous first render). A record read for
    // the OUTGOING identity must never be dispatched over the incoming one's
    // state — `remote.fetch` already drops its late results the same way.
    const stillCurrent = () => {
        if (getIdentity().key === identity.key) return true;
        logger.debug("boot.idb.identityMoved", { meta: { identity: identity.key } });
        return false;
    };
    const warmCachePolicies = policies.filter(
        (p) => getPreset(p.config.preset).storageTier === "idb",
    );

    for (const policy of warmCachePolicies) {
        if (alreadyHydrated.has(policy.config.sliceName)) continue;
        try {
            const record = await readIdbSlice(
                identity.key,
                policy.config.sliceName,
                policy.config.version,
            );
            if (!stillCurrent()) return hydrated;
            if (record) {
                if (record.identityKey !== identity.key) {
                    logger.debug("boot.idb.identityMismatch", {
                        sliceName: policy.config.sliceName,
                    });
                    continue;
                }
                let state: unknown = record.body;
                if (typeof policy.config.deserialize === "function") {
                    try {
                        state = policy.config.deserialize(record.body);
                    } catch (err) {
                        logger.error("boot.idb.deserialize.failed", {
                            sliceName: policy.config.sliceName,
                            meta: {
                                error: extractErrorMessage(err),
                            },
                        });
                        continue;
                    }
                }
                store.dispatch(
                    buildRehydrateAction(policy.config.sliceName, state, {
                        fromRehydrate: true,
                    }),
                );
                hydrated.push(policy.config.sliceName);
                logger.debug("boot.idb.hit", { sliceName: policy.config.sliceName });
                continue;
            }

            // IDB miss — try the localStorage `idbFallback` mirror.
            const fallbackKey = `matrx:idbFallback:${policy.config.sliceName}`;
            const fallbackRecord = localStorageAdapter.read(fallbackKey);
            if (
                fallbackRecord &&
                fallbackRecord.version === policy.config.version &&
                fallbackRecord.identityKey === identity.key
            ) {
                let state: unknown = fallbackRecord.body;
                if (typeof policy.config.deserialize === "function") {
                    try {
                        state = policy.config.deserialize(fallbackRecord.body);
                    } catch (err) {
                        logger.error("boot.idbFallback.deserialize.failed", {
                            sliceName: policy.config.sliceName,
                            meta: {
                                error: extractErrorMessage(err),
                            },
                        });
                        continue;
                    }
                }
                store.dispatch(
                    buildRehydrateAction(policy.config.sliceName, state, {
                        fromRehydrate: true,
                    }),
                );
                hydrated.push(policy.config.sliceName);
                logger.info("boot.idbFallback.hit", {
                    sliceName: policy.config.sliceName,
                });
                continue;
            }
            logger.debug("boot.idb.miss", { sliceName: policy.config.sliceName });
        } catch (err) {
            logger.warn("boot.idb.read.failed", {
                sliceName: policy.config.sliceName,
                meta: { error: extractErrorMessage(err) },
            });
        }
    }
    return hydrated;
}

/**
 * Decide whether a policy that DID hydrate from cache still needs the
 * cold-boot fetch. Default (no `cacheSatisfies` declared) is the historical
 * behavior: a cache hit suppresses the fetch. A policy that declares
 * `remote.cacheSatisfies` gets asked about the post-rehydrate slice state, so
 * a hollow cached record reconciles at boot instead of at `staleAfter`.
 *
 * A throwing predicate is treated as "not sufficient" and logged loudly — an
 * extra reconcile is always cheaper than a session running on missing data.
 */
function cachedStateIsSufficient(policy: Policy<any>, store: Store): boolean {
    const satisfies = policy.config.remote?.cacheSatisfies;
    if (typeof satisfies !== "function") return true;
    const sliceState = (store.getState() as Record<string, unknown>)[
        policy.config.sliceName
    ];
    try {
        return satisfies(sliceState) === true;
    } catch (err) {
        logger.error("boot.cacheSatisfies.threw", {
            sliceName: policy.config.sliceName,
            meta: { error: extractErrorMessage(err) },
        });
        return false;
    }
}

/**
 * For every warm-cache policy that ended boot with no USABLE cached data and
 * declares `remote.fetch`, fire a single cold-boot fetch. "Usable" means an
 * IDB/fallback hit that also passes the policy's `remote.cacheSatisfies` test
 * (default: any hit counts). Fire-and-forget — `invokeRemoteFetch` never rejects.
 */
function scheduleColdBootFallbacks(
    policies: readonly Policy<any>[],
    hydrated: ReadonlySet<string>,
    store: Store,
    getIdentity: () => IdentityKey,
): void {
    for (const policy of policies) {
        const caps = getPreset(policy.config.preset);
        if (caps.storageTier !== "idb") continue;
        if (!policy.config.remote?.fetch) continue;
        if (
            hydrated.has(policy.config.sliceName) &&
            cachedStateIsSufficient(policy, store)
        ) {
            continue;
        }
        if (hydrated.has(policy.config.sliceName)) {
            logger.warn("boot.cache.insufficient", {
                sliceName: policy.config.sliceName,
                meta: {
                    detail:
                        "cached record hydrated but failed remote.cacheSatisfies — reconciling now instead of waiting for staleAfter",
                },
            });
        }
        void invokeRemoteFetch({
            policy,
            store,
            getIdentity,
            reason: "cold-boot",
        });
    }
}

/**
 * Re-run the identity-scoped half of boot after an identity SWAP (the common
 * one: a page that rendered anonymous, then `usePublicAuthSync` lands the real
 * user ~100ms later — `guest:*` → `auth:<id>`).
 *
 * Boot's other half (channel, listeners, legacy migrations, stale timers) is
 * identity-agnostic and must NOT run twice, so this deliberately does only:
 * localStorage rehydrate → IDB rehydrate → cold-boot fetches for the NEW
 * identity. Without it, every `remote.fetch` that keys on `identity.type ===
 * "auth"` stays permanently short-circuited for the tab — which is exactly how
 * a signed-in user with a chosen default organization booted with no active
 * org and got nudged to pick one.
 *
 * Never rejects.
 */
export async function resyncForIdentity(options: {
    store: Store;
    identity: IdentityKey;
    policies: readonly Policy<any>[];
    getIdentity: () => IdentityKey;
}): Promise<void> {
    const { store, identity, policies, getIdentity } = options;
    logger.info("boot.identity.resync", { meta: { identity: identity.key } });
    const fromLocal = new Set(rehydrateFromStorage(policies, identity, store));
    let fromIdb: readonly string[] = [];
    try {
        fromIdb = await hydrateFromIdb(policies, identity, store, fromLocal, getIdentity);
    } catch (err) {
        logger.warn("boot.identity.resync.idbFailed", {
            meta: { error: extractErrorMessage(err) },
        });
    }
    // The identity may have swapped again while IDB was reading — the newer
    // resync owns the fetches.
    if (getIdentity().key !== identity.key) return;
    scheduleColdBootFallbacks(
        policies,
        new Set<string>([...fromLocal, ...fromIdb]),
        store,
        getIdentity,
    );
}

/**
 * Align Redux `theme.mode` with the DOM class SyncBootScript / the server
 * cookie already painted. Slice initialState is `"dark"`, but first paint may
 * be light (cookie, OS fallback, or localStorage read without identity match).
 */
function reconcileThemeFromPaintedDom(store: Store): void {
    if (typeof document === "undefined") return;
    const painted: ThemeMode = document.documentElement.classList.contains("dark")
        ? "dark"
        : "light";
    const state = store.getState() as { theme?: { mode?: ThemeMode } };
    if (state.theme?.mode === painted) return;
    store.dispatch(setMode(painted));
    logger.debug("boot.theme.reconciledFromDom", { meta: { mode: painted } });
}

function attachChannelListener(
    channel: SyncChannel,
    policies: readonly Policy<any>[],
    store: Store,
): void {
    const bySlice = new Map(policies.map((p) => [p.config.sliceName, p] as const));

    channel.subscribe((msg) => {
        if (msg.type === "ACTION") {
            const policy = bySlice.get(msg.sliceName);
            if (!policy) {
                logger.debug("broadcast.unknownSlice", { meta: { sliceName: msg.sliceName } });
                return;
            }
            if (msg.version !== policy.config.version) {
                logger.debug("broadcast.versionMismatch", {
                    sliceName: msg.sliceName,
                    meta: { got: msg.version, want: policy.config.version },
                });
                return;
            }
            // Re-dispatch with meta.fromBroadcast=true so the middleware does not re-emit.
            store.dispatch({
                type: msg.action.type,
                payload: msg.action.payload,
                meta: { fromBroadcast: true },
            });
            logger.debug("broadcast.receive", {
                sliceName: msg.sliceName,
                meta: { type: msg.action.type },
            });
            return;
        }
        // HYDRATE_REQUEST / HYDRATE_RESPONSE handling lands in a follow-up commit
        // inside PR 1.A. Phase 1 requirement §5.3 step: background peer request.
        // Skeleton-only for now so the channel type stays accepted.
        logger.debug("broadcast.receive", { meta: { type: msg.type } });
    });
}

/**
 * The localStorage phase is synchronous once boot begins. The `async`
 * signature preserves the background IDB/remote lifecycle and keeps callers
 * on one stable contract.
 */
export async function bootSync(options: BootOptions): Promise<BootResult> {
    const started = typeof performance !== "undefined" ? performance.now() : 0;
    const { store, identity, policies } = options;
    const openChannel = options.openChannel ?? openSyncChannel;
    const getIdentity = options.getIdentity ?? (() => identity);

    logger.info("boot.start", { meta: { identity: identity.key, policyCount: policies.length } });

    const channel = openChannel(identity);
    const legacyMigrated = runLegacyMigrations(policies, identity);
    const hydratedFromStorage = rehydrateFromStorage(policies, identity, store);
    reconcileThemeFromPaintedDom(store);
    attachChannelListener(channel, policies, store);

    // --- Async IDB hydration (warm-cache slices) ---
    // Doesn't block boot; callers can await `result.idbHydration` when they
    // need the final set (tests + demo). Cold-boot fallbacks are scheduled
    // after IDB resolves so a policy with both cached data AND remote.fetch
    // doesn't fire an unnecessary request.
    const hydratedFromLocal = new Set(hydratedFromStorage);
    const idbHydration: Promise<readonly string[]> = (async () => {
        let hydrated: readonly string[] = [];
        try {
            hydrated = await hydrateFromIdb(
                policies,
                identity,
                store,
                hydratedFromLocal,
                getIdentity,
            );
        } catch (err) {
            logger.warn("boot.idb.pass.failed", {
                meta: { error: extractErrorMessage(err) },
            });
        }
        // A swap during the IDB pass means `resyncForIdentity` already owns the
        // new identity's hydration + fetches; scheduling boot's here would fire
        // them against state that is no longer this identity's.
        if (getIdentity().key !== identity.key) return hydrated;
        const after = new Set<string>([...hydratedFromLocal, ...hydrated]);
        scheduleColdBootFallbacks(policies, after, store, getIdentity);
        return hydrated;
    })();

    // --- Stale refresh scheduler (warm-cache + staleAfter + remote.fetch) ---
    // Arms timers immediately; each fire re-arms itself so the loop survives
    // across identity swaps (the in-flight fetch picks up current identity
    // via `getIdentity`).
    const stale = createStaleRefreshScheduler(policies, store, getIdentity);

    const elapsed = typeof performance !== "undefined" ? performance.now() - started : 0;
    logger.info("boot.complete", {
        ms: elapsed,
        meta: { hydrated: hydratedFromStorage.length, legacyMigrated },
    });

    return { channel, hydratedFromStorage, idbHydration, legacyMigrated, stale };
}
