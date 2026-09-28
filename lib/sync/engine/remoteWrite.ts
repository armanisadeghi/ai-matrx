/**
 * lib/sync/engine/remoteWrite.ts
 *
 * Debounced write sink for `warm-cache` policies. Collects slice bodies, waits
 * for quiescence (default 150ms; override via `policy.remote.debounceMs`), then
 * invokes the policy's `remote.write(ctx, body)`.
 *
 * Contract (see `phase-2-plan.md` §5.3):
 *   - Idempotent call surface — engine may call schedule() many times per
 *     debounce window; only the last payload is written.
 *   - Errors caught + logged; next change triggers a fresh write. No retry
 *     storm.
 *   - `AbortSignal` fires on: rapid re-change (abort the in-flight write),
 *     identity swap (cancel all pending + in-flight), or pagehide cleanup.
 *   - `pagehide` flushes any pending writes synchronously-best-effort (timers
 *     cleared, pending writes invoked without the debounce tail).
 */

import type { Store } from "@reduxjs/toolkit";
import { extractErrorMessage } from "@/utils/errors";
// STATIC, never `import()`: the notice exists for when the network is gone,
// and a lazily-loaded chunk cannot load then (live, 2026-09-27: offline, the
// toast chunk failed ERR_INTERNET_DISCONNECTED and no notice ever showed).
import { toast } from "@/lib/toast";
// MATRX-EXCEPTION: `Policy<any>` throughout this file — same invariant-TState
// reason as lib/sync/registry.ts (partialize: readonly (keyof TState)[] makes
// TState invariant, so `Policy<unknown>` cannot accept the registry's
// heterogeneous `readonly Policy<any>[]`). Every use here only reads
// non-generic fields (config.sliceName/.version/.preset/.remote).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IdentityKey, Policy, WriteContext } from "../types";
import { logger } from "../logger";
import { writeSlice } from "../persistence/idb";
import { localStorageAdapter } from "../persistence/local-storage";
import { getPreset } from "../policies/presets";

interface PendingWrite {
    body: unknown;
    timerHandle: ReturnType<typeof setTimeout> | null;
    inFlightController: AbortController | null;
    /** Consecutive failed remote writes of this pending body (0 = none). */
    failures: number;
}

/**
 * A failed remote write is NEVER dropped. The record stays pending (so no
 * background refresh can land over the unsaved edit — `isRemoteWritePending`)
 * and the flush re-arms itself: 2s, 4s, 8s, 16s, then every 30s until it lands.
 */
export const REMOTE_WRITE_RETRY_BASE_MS = 2_000;
export const REMOTE_WRITE_RETRY_MAX_MS = 30_000;
/** After this many consecutive failures the person is told, with a Retry now. */
export const REMOTE_WRITE_FAILURES_BEFORE_NOTICE = 3;

export function remoteWriteRetryDelay(failures: number): number {
    return Math.min(
        REMOTE_WRITE_RETRY_BASE_MS * 2 ** Math.max(0, failures - 1),
        REMOTE_WRITE_RETRY_MAX_MS,
    );
}

/** Test seam + production default: tell the person a save keeps failing. */
export interface RemoteWriteFailureNotice {
    /** The failures reached the notice threshold (called once per streak). */
    failing(sliceName: string, message: string, retryNow: () => void): void;
    /** The write finally landed — withdraw the notice. */
    recovered(sliceName: string): void;
}

function toastNotice(): RemoteWriteFailureNotice {
    const id = (sliceName: string) => `sync-remote-write-failing:${sliceName}`;
    return {
        failing(sliceName, message, retryNow) {
            toast.error(
                `Your change is not saved yet: ${message}. It is kept on this device and retried automatically.`,
                {
                    id: id(sliceName),
                    duration: Infinity,
                    action: { label: "Retry now", onClick: retryNow },
                },
            );
        },
        recovered(sliceName) {
            toast.dismiss(id(sliceName));
        },
    };
}

export interface RemoteWriteScheduler {
    /** Record the latest body for this slice; schedule / reschedule the flush. */
    schedule(sliceName: string, body: unknown): void;
    /** Flush every pending write immediately (pagehide). */
    flushAll(): Promise<void>;
    /** Cancel in-flight + pending on identity swap — the new identity starts clean. */
    onIdentitySwap(): void;
    /**
     * Record the body the server holds as of a load outcome. A background
     * refresh never lands while a write is pending (`isRemoteWritePending`),
     * and edits held before the first load are rescheduled on top of it
     * (`persistAfterLoad`), so the base only moves under settled state.
     */
    setBase(sliceName: string, body: unknown): void;
    /** True while a write for the slice is scheduled or in flight. */
    hasPending(sliceName: string): boolean;
    /** Tear down listeners. */
    dispose(): void;
}

export interface CreateRemoteWriteSchedulerOptions {
    policies: readonly Policy<any>[];
    store: Store;
    getIdentity: () => IdentityKey;
    /** Test-only override; production hooks window.addEventListener('pagehide'). */
    attachPageHide?: (flush: () => void) => () => void;
    /** Test-only default debounce override. Policy-level debounceMs still wins. */
    defaultDebounceMs?: number;
    /** Test-only: how a persistent write failure is told to the person. Default: a toast. */
    failureNotice?: RemoteWriteFailureNotice;
}

const DEFAULT_DEBOUNCE_MS = 150;

/**
 * Every live scheduler, so the refresh path can ask "does this slice hold
 * unsaved edits?" without a reference to the middleware's closure. A refresh
 * that lands over unsaved edits would repaint them with the server's older
 * values (and move the write's base under it), so the refresh waits.
 */
const liveSchedulers = new Set<RemoteWriteScheduler>();

/** True when any live scheduler holds a pending or in-flight write for the slice. */
export function isRemoteWritePending(sliceName: string): boolean {
    for (const scheduler of liveSchedulers) {
        if (scheduler.hasPending(sliceName)) return true;
    }
    return false;
}

export function createRemoteWriteScheduler(
    opts: CreateRemoteWriteSchedulerOptions,
): RemoteWriteScheduler {
    const { policies, store, getIdentity } = opts;
    const defaultDebounce = opts.defaultDebounceMs ?? DEFAULT_DEBOUNCE_MS;
    const failureNotice = opts.failureNotice ?? toastNotice();

    // Every warm-cache policy gets a pending entry when it mutates. Policies
    // without `remote.write` still flow through for the IDB-persist leg.
    const bySlice = new Map<string, Policy<any>>(
        policies
            .filter((p) => getPreset(p.config.preset).writeStrategy === "debounced")
            .map((p) => [p.config.sliceName, p] as const),
    );
    const pending = new Map<string, PendingWrite>();
    /** The body the server holds, per slice — see `WriteContext.base`. */
    const baseBySlice = new Map<string, unknown>();

    async function flushOne(sliceName: string): Promise<void> {
        const record = pending.get(sliceName);
        const policy = bySlice.get(sliceName);
        if (!record || !policy) return;

        // THE PERSIST GATE. Every warm-cache write — debounce, pagehide flush,
        // programmatic flush — lands here, so this is the one place a slice
        // that is not ready (its saved record has not loaded) is refused.
        // The body is HELD, never written; the next schedule replaces it.
        const persistWhen = policy.config.persistWhen;
        if (typeof persistWhen === "function") {
            let ready = false;
            try {
                const live = (store.getState() as Record<string, unknown>)[sliceName];
                ready = persistWhen(live) === true;
            } catch (err) {
                logger.error("persist.gate.threw", {
                    sliceName,
                    meta: { error: extractErrorMessage(err) },
                });
            }
            if (!ready) {
                // DROP the body — never keep it for a later flush (a pagehide
                // after the load would write this pre-load body, defaults and
                // all). The slice holds the edits itself and asks for one save
                // when its record loads (`policy.persistAfterLoad`).
                if (record.timerHandle) clearTimeout(record.timerHandle);
                record.inFlightController?.abort();
                pending.delete(sliceName);
                logger.warn("persist.held", {
                    sliceName,
                    meta: {
                        detail: "saved record not loaded — nothing written, so defaults never overwrite it",
                    },
                });
                return;
            }
        }

        // Abort any previous in-flight for this slice so the latest body
        // supersedes.
        record.inFlightController?.abort();

        const controller = new AbortController();
        record.inFlightController = controller;
        if (record.timerHandle) {
            clearTimeout(record.timerHandle);
            record.timerHandle = null;
        }

        const identity = getIdentity();
        const sliceState = record.body;

        // --- Storage leg (idb primary, localStorage fallback for warm-cache) ---
        try {
            await writeSlice(
                identity.key,
                sliceName,
                policy.config.version,
                sliceState,
            );
            // Mirror into localStorage as the idbFallback tier (private browsing
            // / IDB-disabled path). Small cost, huge resilience win — boot reads
            // this path when idb.open fails.
            localStorageAdapter.write(`matrx:idbFallback:${sliceName}`, {
                version: policy.config.version,
                identityKey: identity.key,
                body: sliceState,
            });
        } catch (err) {
            logger.warn("idb.write.error", {
                sliceName,
                meta: { error: extractErrorMessage(err) },
            });
        }

        // --- Remote leg (optional; only if policy declares remote.write) ---
        const writeFn = policy.config.remote?.write;
        if (!writeFn) {
            // IDB-only slice: clean up pending entry and return.
            maybeClearPending(sliceName, controller);
            return;
        }

        const ctx: WriteContext<unknown> = {
            identity,
            signal: controller.signal,
            body: sliceState,
            base: baseBySlice.get(sliceName),
        };

        let failure: unknown = null;
        try {
            logger.debug("remote.write.flush", {
                sliceName,
                meta: { identity: identity.key, bytes: approximateBytes(sliceState) },
            });
            await writeFn(ctx as WriteContext<never>);
            // The server now holds this body's changes: the next write diffs
            // from here. (A failed or aborted write keeps the old base, so its
            // changes are sent again with the next one.)
            if (!controller.signal.aborted) baseBySlice.set(sliceName, sliceState);
        } catch (err) {
            failure = err;
        }

        if (failure !== null && !controller.signal.aborted) {
            // NEVER dropped: keep the record pending and re-arm with backoff.
            retryAfterFailure(sliceName, controller, failure);
            return;
        }
        if (failure === null && !controller.signal.aborted && record.failures > 0) {
            logger.info("remote.write.recovered", {
                sliceName,
                meta: { afterFailures: record.failures },
            });
            if (record.failures >= REMOTE_WRITE_FAILURES_BEFORE_NOTICE) {
                failureNotice.recovered(sliceName);
            }
            record.failures = 0;
        }
        maybeClearPending(sliceName, controller);
    }

    function retryAfterFailure(
        sliceName: string,
        controller: AbortController,
        err: unknown,
    ): void {
        const record = pending.get(sliceName);
        if (!record) return;
        if (record.inFlightController === controller) record.inFlightController = null;
        record.failures += 1;
        const message = extractErrorMessage(err);
        // A newer edit already scheduled its own flush: it carries these
        // changes too (same base), so it is the retry.
        if (record.timerHandle === null) {
            const delay = remoteWriteRetryDelay(record.failures);
            record.timerHandle = setTimeout(() => {
                record.timerHandle = null;
                void flushOne(sliceName);
            }, delay);
            logger.warn("remote.write.error", {
                sliceName,
                meta: { error: message, failures: record.failures, retryInMs: delay },
            });
        } else {
            logger.warn("remote.write.error", {
                sliceName,
                meta: { error: message, failures: record.failures, retry: "next edit's flush" },
            });
        }
        if (record.failures === REMOTE_WRITE_FAILURES_BEFORE_NOTICE) {
            failureNotice.failing(sliceName, message, () => {
                const now = pending.get(sliceName);
                if (!now) return;
                if (now.timerHandle) clearTimeout(now.timerHandle);
                now.timerHandle = null;
                void flushOne(sliceName);
            });
        }
    }

    /**
     * Clean up the pending entry when our flush's controller is still the
     * active one. If `schedule()` fired while we were in-flight, it would
     * have reset `body` + timer; leave that state alone so the next debounce
     * picks it up.
     */
    function maybeClearPending(sliceName: string, controller: AbortController): void {
        const now = pending.get(sliceName);
        if (
            now &&
            now.timerHandle === null &&
            now.inFlightController === controller
        ) {
            pending.delete(sliceName);
        } else if (now && now.inFlightController === controller) {
            now.inFlightController = null;
        }
    }

    function scheduleFlush(sliceName: string, debounceMs: number): void {
        const record = pending.get(sliceName);
        if (!record) return;
        if (record.timerHandle) clearTimeout(record.timerHandle);
        record.timerHandle = setTimeout(() => {
            void flushOne(sliceName);
        }, debounceMs);
    }

    function schedule(sliceName: string, body: unknown): void {
        const policy = bySlice.get(sliceName);
        if (!policy) return;
        const existing = pending.get(sliceName);
        const next: PendingWrite = existing ?? {
            body,
            timerHandle: null,
            inFlightController: null,
            failures: 0,
        };
        next.body = body;
        // If there's an in-flight write, abort it — the new body is newer.
        if (next.inFlightController) {
            next.inFlightController.abort();
            next.inFlightController = null;
        }
        pending.set(sliceName, next);
        const debounceMs = policy.config.remote?.debounceMs ?? defaultDebounce;
        logger.debug("remote.write.scheduled", {
            sliceName,
            meta: { debounceMs },
        });
        scheduleFlush(sliceName, debounceMs);
    }

    async function flushAll(): Promise<void> {
        const names = Array.from(pending.keys());
        await Promise.all(names.map((n) => flushOne(n)));
    }

    function onIdentitySwap(): void {
        for (const [name, record] of pending) {
            record.inFlightController?.abort();
            if (record.timerHandle) clearTimeout(record.timerHandle);
            pending.delete(name);
        }
        logger.info("remote.write.identity-swap.drop", {
            meta: { dropped: pending.size },
        });
    }

    // --- pagehide wiring ---
    function flushOnPageHide(): void {
        void flushAll();
    }
    let detachPageHide: (() => void) | null = null;
    if (opts.attachPageHide) {
        detachPageHide = opts.attachPageHide(flushOnPageHide);
    } else if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        const handler = () => flushOnPageHide();
        window.addEventListener("pagehide", handler);
        detachPageHide = () => window.removeEventListener("pagehide", handler);
    }

    const scheduler: RemoteWriteScheduler = {
        schedule,
        flushAll,
        onIdentitySwap() {
            onIdentitySwap();
            baseBySlice.clear();
        },
        setBase(sliceName, body) {
            baseBySlice.set(sliceName, body);
        },
        hasPending(sliceName) {
            // Only a REMOTE write makes a refresh wait: an IDB-only slice has
            // nothing a server answer could overwrite.
            return pending.has(sliceName) && !!bySlice.get(sliceName)?.config.remote?.write;
        },
        dispose() {
            for (const record of pending.values()) {
                record.inFlightController?.abort();
                if (record.timerHandle) clearTimeout(record.timerHandle);
            }
            pending.clear();
            baseBySlice.clear();
            liveSchedulers.delete(scheduler);
            detachPageHide?.();
        },
    };
    liveSchedulers.add(scheduler);
    return scheduler;
}

function approximateBytes(body: unknown): number {
    try {
        return JSON.stringify(body).length;
    } catch {
        return -1;
    }
}
