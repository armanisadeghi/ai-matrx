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
}

export interface RemoteWriteScheduler {
    /** Record the latest body for this slice; schedule / reschedule the flush. */
    schedule(sliceName: string, body: unknown): void;
    /** Flush every pending write immediately (pagehide). */
    flushAll(): Promise<void>;
    /** Cancel in-flight + pending on identity swap — the new identity starts clean. */
    onIdentitySwap(): void;
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
}

const DEFAULT_DEBOUNCE_MS = 150;

export function createRemoteWriteScheduler(
    opts: CreateRemoteWriteSchedulerOptions,
): RemoteWriteScheduler {
    const { policies, store, getIdentity } = opts;
    const defaultDebounce = opts.defaultDebounceMs ?? DEFAULT_DEBOUNCE_MS;

    // Every warm-cache policy gets a pending entry when it mutates. Policies
    // without `remote.write` still flow through for the IDB-persist leg.
    const bySlice = new Map<string, Policy<any>>(
        policies
            .filter((p) => getPreset(p.config.preset).writeStrategy === "debounced")
            .map((p) => [p.config.sliceName, p] as const),
    );
    const pending = new Map<string, PendingWrite>();

    async function flushOne(sliceName: string): Promise<void> {
        const record = pending.get(sliceName);
        const policy = bySlice.get(sliceName);
        if (!record || !policy) return;

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
        };

        try {
            logger.debug("remote.write.flush", {
                sliceName,
                meta: { identity: identity.key, bytes: approximateBytes(sliceState) },
            });
            await writeFn(ctx as WriteContext<never>);
        } catch (err) {
            logger.warn("remote.write.error", {
                sliceName,
                meta: { error: extractErrorMessage(err) },
            });
        } finally {
            maybeClearPending(sliceName, controller);
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

    return {
        schedule,
        flushAll,
        onIdentitySwap,
        dispose() {
            for (const record of pending.values()) {
                record.inFlightController?.abort();
                if (record.timerHandle) clearTimeout(record.timerHandle);
            }
            pending.clear();
            detachPageHide?.();
        },
    };
}

function approximateBytes(body: unknown): number {
    try {
        return JSON.stringify(body).length;
    } catch {
        return -1;
    }
}
