/**
 * lib/sync/engine/autoSaveScheduler.ts
 *
 * Per-record auto-save scheduler — sibling of `remoteWrite.ts`. Where
 * `remoteWrite` debounces a single body per slice, this scheduler maintains
 * one timer + one in-flight controller per **record** (note id, file id,
 * agent id, panel id, etc.). Records are read from the slice state via
 * `policy.config.autoSave.recordsKey`.
 *
 * Replaces (Phase 5 deletion target): per-feature middlewares + hooks —
 *   - features/notes/redux/autoSaveMiddleware.ts
 *   - features/code-files/redux/autoSaveMiddleware.ts
 *   - features/agents/hooks/useAgentAutoSave.ts
 *   - features/prompts/hooks/usePromptAutoSave.ts
 *   - features/window-panels/* autosave block
 *
 * Contract:
 *   - Idempotent `schedule(slice, id)` — multiple calls within a debounce
 *     window collapse to one write of the LATEST record state at flush time.
 *   - `shouldSave(record, id)` predicate gates each scheduled save (default:
 *     `record._dirty === true`).
 *   - Writes are awaited; the engine catches errors → `optimistic.onError`.
 *   - `AbortSignal` fires on rapid re-change, identity swap, pagehide cleanup.
 *   - Pending-write tracking exposed via `isPendingEcho(slice, id)` so the
 *     realtime middleware can suppress its own postgres_changes echoes.
 */

import type { Store, UnknownAction } from "@reduxjs/toolkit";
import { extractErrorMessage } from "@/utils/errors";
// MATRX-EXCEPTION: `Policy<any>` / `AutoSaveConfig<any>` — same invariant-TState
// reason as lib/sync/registry.ts (partialize: readonly (keyof TState)[] makes
// TState invariant, so `Policy<unknown>` cannot accept the registry's
// heterogeneous `readonly Policy<any>[]`).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
    AutoSaveConfig,
    IdentityKey,
    Policy,
} from "../types";
import { logger } from "../logger";

/** Narrows an optimistic action-creator's return value to a dispatchable Redux action. */
function isDispatchableAction(value: unknown): value is UnknownAction {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as { type?: unknown }).type === "string"
    );
}

interface PendingAutoSave {
    timerHandle: ReturnType<typeof setTimeout> | null;
    inFlightController: AbortController | null;
}

export interface AutoSaveScheduler {
    /** Schedule a per-record save (or reschedule the timer if one exists). */
    schedule(sliceName: string, recordId: string): void;
    /** Programmatic flush — used by visibility/unmount handlers. */
    flush(sliceName: string, recordId?: string): Promise<void>;
    /** Flush every pending record across all slices (pagehide). */
    flushAll(): Promise<void>;
    /** Test the pending-echo set — used by realtime middlewares. */
    isPendingEcho(sliceName: string, recordId: string): boolean;
    /** Cancel everything on identity swap; the new identity starts clean. */
    onIdentitySwap(): void;
    /** Tear down listeners. */
    dispose(): void;
}

export interface CreateAutoSaveSchedulerOptions {
    policies: readonly Policy<any>[];
    store: Store;
    getIdentity: () => IdentityKey;
    /** Test-only override; production hooks `window.addEventListener("pagehide")`. */
    attachPageHide?: (flush: () => void) => () => void;
    /** Test-only default debounce override. Policy-level wins. */
    defaultDebounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 1500;

export function createAutoSaveScheduler(
    opts: CreateAutoSaveSchedulerOptions,
): AutoSaveScheduler {
    const { policies, store, getIdentity } = opts;
    const defaultDebounce = opts.defaultDebounceMs ?? DEFAULT_DEBOUNCE_MS;

    // Only policies with an autoSave block participate.
    const bySlice = new Map<string, Policy<any>>();
    for (const p of policies) {
        if (p.config.autoSave) bySlice.set(p.config.sliceName, p);
    }

    // pending: sliceName → recordId → PendingAutoSave (one timer per record).
    const pending = new Map<string, Map<string, PendingAutoSave>>();
    // pendingEchoes: sliceName → Set<recordId>. Mirrors `pending` for the
    // duration of schedule → write-resolves/rejects. Realtime middlewares
    // read this via `isPendingEcho`.
    const pendingEchoes = new Map<string, Set<string>>();

    function bucketFor(sliceName: string): Map<string, PendingAutoSave> {
        let bucket = pending.get(sliceName);
        if (!bucket) {
            bucket = new Map();
            pending.set(sliceName, bucket);
        }
        return bucket;
    }

    function echoSetFor(sliceName: string): Set<string> {
        let s = pendingEchoes.get(sliceName);
        if (!s) {
            s = new Set();
            pendingEchoes.set(sliceName, s);
        }
        return s;
    }

    function selectRecord(
        cfg: AutoSaveConfig<any>,
        sliceState: unknown,
        recordId: string,
    ): unknown {
        if (!sliceState || typeof sliceState !== "object") return undefined;
        const records = (sliceState as Record<string, unknown>)[cfg.recordsKey as string];
        if (!records || typeof records !== "object") return undefined;
        return (records as Record<string, unknown>)[recordId];
    }

    function selectSliceState(sliceName: string): unknown {
        const root = store.getState() as Record<string, unknown>;
        return root?.[sliceName];
    }

    function debounceForRecord(
        cfg: AutoSaveConfig<any>,
        record: unknown,
        recordId: string,
    ): number {
        if (typeof cfg.debounceMs === "function") {
            try {
                return cfg.debounceMs(record, recordId);
            } catch {
                return defaultDebounce;
            }
        }
        return cfg.debounceMs ?? defaultDebounce;
    }

    function shouldSave(
        cfg: AutoSaveConfig<any>,
        record: unknown,
        recordId: string,
    ): boolean {
        if (record === undefined || record === null) return false;
        if (cfg.shouldSave) {
            try {
                return cfg.shouldSave(record, recordId);
            } catch {
                return false;
            }
        }
        return (
            typeof record === "object" &&
            (record as { _dirty?: unknown })._dirty === true
        );
    }

    async function flushOne(sliceName: string, recordId: string): Promise<void> {
        const policy = bySlice.get(sliceName);
        if (!policy?.config.autoSave) return;
        const cfg = policy.config.autoSave;

        const bucket = bucketFor(sliceName);
        const entry = bucket.get(recordId);
        if (!entry) return;

        // Abort any prior in-flight for this record so the latest state wins.
        entry.inFlightController?.abort();
        if (entry.timerHandle) {
            clearTimeout(entry.timerHandle);
            entry.timerHandle = null;
        }

        const sliceState = selectSliceState(sliceName);
        const record = selectRecord(cfg, sliceState, recordId);
        if (!shouldSave(cfg, record, recordId)) {
            // Predicate flipped while debouncing (e.g. record cleaned by an
            // explicit save) — drop without dispatching optimistic actions.
            bucket.delete(recordId);
            if (cfg.trackEchoes) echoSetFor(sliceName).delete(recordId);
            return;
        }

        const controller = new AbortController();
        entry.inFlightController = controller;

        // Optimistic onStart.
        try {
            const onStart = cfg.optimistic?.onStart?.(recordId);
            if (isDispatchableAction(onStart)) {
                store.dispatch(onStart);
            }
        } catch (err) {
            logger.error("autoSave.optimistic.onStart.failed", {
                sliceName,
                meta: { recordId, error: extractErrorMessage(err) },
            });
        }

        const identity = getIdentity();
        try {
            const result = await cfg.write({
                identity,
                signal: controller.signal,
                recordId,
                record,
                sliceState,
            });
            // The optimistic.onSuccess is dispatched only if the write was not
            // aborted (e.g. a fresh schedule may have superseded us).
            if (!controller.signal.aborted) {
                try {
                    const onSuccess = cfg.optimistic?.onSuccess?.(
                        recordId,
                        result,
                    );
                    if (isDispatchableAction(onSuccess)) {
                        store.dispatch(onSuccess);
                    }
                } catch (err) {
                    logger.error("autoSave.optimistic.onSuccess.failed", {
                        sliceName,
                        meta: { recordId, error: extractErrorMessage(err) },
                    });
                }
            }
        } catch (err) {
            if (!controller.signal.aborted) {
                logger.warn("autoSave.write.failed", {
                    sliceName,
                    meta: { recordId, error: extractErrorMessage(err) },
                });
                try {
                    const onError = cfg.optimistic?.onError?.(
                        recordId,
                        extractErrorMessage(err),
                    );
                    if (isDispatchableAction(onError)) {
                        store.dispatch(onError);
                    }
                } catch (oeErr) {
                    logger.error("autoSave.optimistic.onError.failed", {
                        sliceName,
                        meta: {
                            recordId,
                            error: extractErrorMessage(oeErr),
                        },
                    });
                }
            }
        } finally {
            // Clear the bucket entry IF the controller wasn't superseded by
            // a fresh schedule. Otherwise the new entry will replace it.
            const cur = bucket.get(recordId);
            if (cur && cur.inFlightController === controller) {
                bucket.delete(recordId);
            }
            if (cfg.trackEchoes) {
                echoSetFor(sliceName).delete(recordId);
            }
        }
    }

    function schedule(sliceName: string, recordId: string): void {
        const policy = bySlice.get(sliceName);
        if (!policy?.config.autoSave) return;
        const cfg = policy.config.autoSave;

        const sliceState = selectSliceState(sliceName);
        const record = selectRecord(cfg, sliceState, recordId);
        if (!shouldSave(cfg, record, recordId)) return;

        const bucket = bucketFor(sliceName);
        const existing = bucket.get(recordId);
        if (existing?.timerHandle) clearTimeout(existing.timerHandle);
        existing?.inFlightController?.abort();

        const next: PendingAutoSave = {
            timerHandle: null,
            inFlightController: null,
        };
        bucket.set(recordId, next);

        if (cfg.trackEchoes) echoSetFor(sliceName).add(recordId);

        const debounce = debounceForRecord(cfg, record, recordId);
        if (debounce <= 0) {
            // Fire-and-forget — engine doesn't block the action.
            void flushOne(sliceName, recordId);
            return;
        }
        next.timerHandle = setTimeout(() => {
            next.timerHandle = null;
            void flushOne(sliceName, recordId);
        }, debounce);
    }

    async function flush(
        sliceName: string,
        recordId?: string,
    ): Promise<void> {
        const bucket = pending.get(sliceName);
        if (!bucket) return;
        if (recordId !== undefined) {
            if (bucket.has(recordId)) {
                await flushOne(sliceName, recordId);
            }
            return;
        }
        const ids = Array.from(bucket.keys());
        await Promise.allSettled(ids.map((id) => flushOne(sliceName, id)));
    }

    async function flushAll(): Promise<void> {
        const tasks: Promise<void>[] = [];
        for (const sliceName of pending.keys()) {
            const policy = bySlice.get(sliceName);
            if (!policy?.config.autoSave) continue;
            // Honor flushOnHide flag for pagehide — programmatic `flush()`
            // ignores it.
            // (flushAll is only ever called by the pagehide hook below.)
            const flushOnHide = policy.config.autoSave.flushOnHide ?? true;
            if (!flushOnHide) continue;
            const bucket = pending.get(sliceName);
            if (!bucket) continue;
            for (const id of bucket.keys()) {
                tasks.push(flushOne(sliceName, id));
            }
        }
        await Promise.allSettled(tasks);
    }

    function isPendingEcho(sliceName: string, recordId: string): boolean {
        return echoSetFor(sliceName).has(recordId);
    }

    function onIdentitySwap(): void {
        // Cancel everything; the new identity starts clean.
        for (const [, bucket] of pending) {
            for (const [, entry] of bucket) {
                if (entry.timerHandle) clearTimeout(entry.timerHandle);
                entry.inFlightController?.abort();
            }
            bucket.clear();
        }
        for (const [, set] of pendingEchoes) set.clear();
    }

    // pagehide listener — flush pending records best-effort. The default
    // wraps `window.addEventListener("pagehide")`; tests inject their own.
    const detach =
        opts.attachPageHide?.(() => {
            void flushAll();
        }) ??
        (() => {
            if (typeof window === "undefined") return () => {};
            const handler = () => {
                void flushAll();
            };
            window.addEventListener("pagehide", handler);
            return () => window.removeEventListener("pagehide", handler);
        })();

    function dispose(): void {
        detach?.();
        for (const [, bucket] of pending) {
            for (const [, entry] of bucket) {
                if (entry.timerHandle) clearTimeout(entry.timerHandle);
                entry.inFlightController?.abort();
            }
            bucket.clear();
        }
        pending.clear();
        for (const [, set] of pendingEchoes) set.clear();
        pendingEchoes.clear();
    }

    return {
        schedule,
        flush,
        flushAll,
        isPendingEcho,
        onIdentitySwap,
        dispose,
    };
}
