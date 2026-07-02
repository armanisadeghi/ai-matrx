/**
 * lib/sync/engine/middleware.ts
 *
 * The single sync middleware. Behavior per action:
 *   1. next(action)  — state update runs first, so persist + broadcast reflect post-reducer state.
 *   2. Broadcast: if the action type is in a policy's allow-list AND meta.fromBroadcast is falsy, emit.
 *   3. Persist: for boot-critical slices whose state changed, write through synchronously.
 *   4. Incoming channel messages are re-dispatched with meta.fromBroadcast=true by `attachChannel`.
 *
 * Replaces (over time): per-feature broadcast wiring + auto-save middlewares
 * (manifest items 8–14). Delete trigger: Phase 5 for autoSave; ui-broadcast
 * migration retires legacy broadcast plumbing earlier.
 */

import type { Middleware, MiddlewareAPI } from "@reduxjs/toolkit";
import { extractErrorMessage } from "@/utils/errors";
import { logger } from "../logger";
import { buildActionMessage, type ActionMessage } from "../messages";
// MATRX-EXCEPTION: `Policy<any>` throughout this file — same invariant-TState
// reason as lib/sync/registry.ts (partialize: readonly (keyof TState)[] makes
// TState invariant, so `Policy<unknown>` cannot accept the registry's
// heterogeneous `readonly Policy<any>[]`). Every use here only reads
// non-generic fields (config.sliceName/.version/.preset, broadcastActions, …).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Policy, SyncActionMeta, IdentityKey } from "../types";
import { getPreset } from "../policies/presets";
import { localStorageAdapter } from "../persistence/local-storage";
import { noopAdapter } from "../persistence/noop";
import type { PersistenceAdapter } from "../persistence/types";
import type { SyncChannel } from "../channel";
import { isRehydrateAction } from "./rehydrate";
import { applyPrePaintDescriptors } from "./applyPrePaint";
import {
  createRemoteWriteScheduler,
  type RemoteWriteScheduler,
} from "./remoteWrite";
import {
  createAutoSaveScheduler,
  type AutoSaveScheduler,
} from "./autoSaveScheduler";

interface ActionWithMeta {
  type: string;
  payload?: unknown;
  meta?: SyncActionMeta;
}

function hasMetaFromBroadcast(action: unknown): boolean {
  return (
    action !== null &&
    typeof action === "object" &&
    (action as { meta?: SyncActionMeta }).meta?.fromBroadcast === true
  );
}

function adapterFor(policy: Policy<any>): PersistenceAdapter {
  const caps = getPreset(policy.config.preset);
  return caps.persists ? localStorageAdapter : noopAdapter;
}

function selectSliceState(rootState: unknown, sliceName: string): unknown {
  if (rootState === null || typeof rootState !== "object") return undefined;
  return (rootState as Record<string, unknown>)[sliceName];
}

/**
 * Phase 5: extract a recordId from an autoSave-triggering action payload.
 * Conventions checked, in order:
 *   - payload.id (most slices: notes, agents)
 *   - payload.recordId (explicit)
 *   - payload.noteId / payload.fileId / payload.agentId (legacy slice fields)
 * Returns undefined if no recognized id present (action is dropped from
 * the autoSave path — the slice still mutates).
 */
function extractRecordId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const p = payload as Record<string, unknown>;
  for (const key of ["id", "recordId", "noteId", "fileId", "agentId"]) {
    const v = p[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function partialize(
  state: unknown,
  keys: readonly PropertyKey[] | undefined,
): unknown {
  if (!keys || keys.length === 0) return state;
  if (state === null || typeof state !== "object") return state;
  const src = state as Record<PropertyKey, unknown>;
  const out: Record<PropertyKey, unknown> = {};
  for (const k of keys) out[k] = src[k];
  return out;
}

function serializeBody(policy: Policy<any>, sliceState: unknown): unknown {
  const cfg = policy.config;
  const filtered = partialize(
    sliceState,
    cfg.partialize as readonly PropertyKey[] | undefined,
  );
  if (typeof cfg.serialize === "function") {
    try {
      return cfg.serialize(filtered as never);
    } catch (err) {
      logger.error("persist.serialize.failed", {
        sliceName: cfg.sliceName,
        meta: { error: extractErrorMessage(err) },
      });
      return null;
    }
  }
  return filtered;
}

/**
 * Phase 5: external-facing engine API. Returned to consumers via
 * `apiRef.current` after the store is constructed. Used by:
 *   - `realtimeMiddleware` (notes) → `isPendingEcho` to skip Supabase echoes
 *   - window panels' visibility-flush handler → `flushAutoSave` programmatic
 *   - dev-only debug panels — observability hooks
 */
export interface SyncEngineApi {
  /** True if an autoSave write is in flight or scheduled for `(slice, recordId)`. */
  isPendingEcho(sliceName: string, recordId: string): boolean;
  /**
   * Programmatic flush. With `recordId`, flushes that one record; without,
   * flushes every pending record across every autoSave slice. Awaited so
   * callers can sequence around it.
   */
  flushAutoSave(sliceName: string, recordId?: string): Promise<void>;
}

export interface SyncMiddlewareContext {
  policies: readonly Policy<any>[];
  channel: SyncChannel;
  getIdentity: () => IdentityKey;
  /**
   * Test-only override for the warm-cache debounce window's default. Policy-
   * level `remote.debounceMs` still wins. Production callers omit this.
   */
  defaultDebounceMs?: number;
  /**
   * Phase 5: mutable holder so the store can read out the engine API after
   * construction. Optional — tests that don't need the API can omit it.
   */
  apiRef?: { current: SyncEngineApi | null };
}

/**
 * Build the Redux middleware. The engine owns it; callers pass the context
 * once at store creation.
 */
export function createSyncMiddleware(ctx: SyncMiddlewareContext): Middleware {
  // Index broadcast actions → policies for O(1) lookup.
  const broadcastIndex = new Map<string, Policy<any>>();
  for (const p of ctx.policies) {
    for (const actionType of p.broadcastActions) {
      if (broadcastIndex.has(actionType)) {
        logger.warn("policy.broadcast.duplicate", {
          meta: { actionType, sliceName: p.config.sliceName },
        });
      }
      broadcastIndex.set(actionType, p);
    }
  }

  // Track previous slice state refs so we only persist when the slice changed.
  const lastPersistedRef = new Map<string, unknown>();
  // Same idea for runtime DOM application — avoid re-applying on every action
  // when the slice state hasn't changed. Separate map because persist skips
  // rehydrate actions (see below) but DOM apply does not.
  const lastAppliedRef = new Map<string, unknown>();
  // Seeded on the first action's `api.getState()` — captures the SSR /
  // preloaded baseline so we don't falsely persist it back on the first
  // post-boot user action. Without this, `lastPersistedRef.get(sliceName)`
  // is `undefined` for every slice at boot, and the first non-REHYDRATE
  // action (e.g. a broker-setValue) triggers a redundant debounced write:
  // IDB + LS mirror + remote.write. For
  // `warm-cache` policies like `userPreferences` that remote.write is a
  // visible Supabase upsert that Arman saw in the Phase 2 browser
  // checklist (one POST on warm refresh; a GET+POST pair on cold refresh).
  let seededFromBoot = false;
  // Warm-cache debounced write sink (IDB + remote.write). Lazily constructed
  // so stores that don't use warm-cache don't install a pagehide listener.
  let remoteWriteScheduler: RemoteWriteScheduler | null = null;
  const hasWarmCache = ctx.policies.some(
    (p) => getPreset(p.config.preset).writeStrategy === "debounced",
  );
  // Phase 5: per-record auto-save. Lazy — only constructed when at least one
  // policy declares an autoSave block AND a triggerActions match lands.
  let autoSaveScheduler: AutoSaveScheduler | null = null;
  // Action allowlist → policies (for autoSave). One action may trigger
  // multiple policies, but in practice we keep these disjoint per slice.
  const autoSaveTriggerIndex = new Map<string, Policy<any>[]>();

  // Expose the engine API via the optional caller-supplied ref. Read by
  // `realtimeMiddleware.ts` for echo suppression + by panels for
  // programmatic flush.
  if (ctx.apiRef) {
    ctx.apiRef.current = {
      isPendingEcho: (slice, recordId) =>
        autoSaveScheduler?.isPendingEcho(slice, recordId) ?? false,
      flushAutoSave: async (slice, recordId) => {
        if (!autoSaveScheduler) return;
        await autoSaveScheduler.flush(slice, recordId);
      },
    };
  }
  for (const p of ctx.policies) {
    const cfg = p.config.autoSave;
    if (!cfg) continue;
    for (const t of cfg.triggerActions) {
      const list = autoSaveTriggerIndex.get(t) ?? [];
      list.push(p);
      autoSaveTriggerIndex.set(t, list);
    }
  }
  // Track identity across actions so a swap clears in-flight writes (and
  // we never re-key a write-in-progress to the new identity).
  let lastSeenIdentity = ctx.getIdentity().key;

  const middleware: Middleware =
    (api: MiddlewareAPI) =>
    (next: (action: unknown) => unknown) =>
    (action: unknown) => {
      // Seed baselines BEFORE `next(action)` so the first mutation is
      // compared against the boot state — not against the post-action
      // state. Must run exactly once per middleware instance.
      if (!seededFromBoot) {
        seededFromBoot = true;
        const bootState = api.getState();
        for (const policy of ctx.policies) {
          const sliceState = selectSliceState(
            bootState,
            policy.config.sliceName,
          );
          if (sliceState !== undefined) {
            lastPersistedRef.set(policy.config.sliceName, sliceState);
            lastAppliedRef.set(policy.config.sliceName, sliceState);
          }
        }
      }

      const result = next(action);

      // Ignore rehydrate echoes and anything without a string type.
      if (
        action === null ||
        typeof action !== "object" ||
        typeof (action as { type?: unknown }).type !== "string"
      ) {
        return result;
      }
      const a = action as ActionWithMeta;

      // --- Broadcast ---
      const broadcastPolicy = broadcastIndex.get(a.type);
      if (broadcastPolicy && !hasMetaFromBroadcast(a)) {
        try {
          const identity = ctx.getIdentity();
          const sliceState = selectSliceState(
            api.getState(),
            broadcastPolicy.config.sliceName,
          );
          const msg: ActionMessage = buildActionMessage(
            identity.key,
            broadcastPolicy.config.sliceName,
            broadcastPolicy.config.version,
            { type: a.type, payload: a.payload },
          );
          ctx.channel.post(msg);
          // Hint to TS — we may use sliceState below.
          void sliceState;
        } catch (err) {
          logger.error("broadcast.emit.failed", {
            meta: { error: extractErrorMessage(err) },
          });
        }
      }

      // Detect identity swap between actions. The sync context's getIdentity
      // is a closure over `currentIdentity` in `makeStore`; if it changed,
      // cancel any pending debounced writes so they don't land under the
      // wrong identity.
      const currentIdentityKey = ctx.getIdentity().key;
      if (currentIdentityKey !== lastSeenIdentity) {
        lastSeenIdentity = currentIdentityKey;
        remoteWriteScheduler?.onIdentitySwap();
        autoSaveScheduler?.onIdentitySwap();
      }

      // --- AutoSave (per-record, post-reducer) ---
      // For each policy whose `autoSave.triggerActions` includes this action,
      // schedule a save on the recordId carried in the action payload.
      // Convention: action.payload.id (or .recordId, or .noteId, or .fileId)
      // is the per-record key. The slice reducer is responsible for the
      // mutation; the engine just schedules the write.
      if (!isRehydrateAction(a)) {
        const triggered = autoSaveTriggerIndex.get(a.type);
        if (triggered && triggered.length > 0) {
          const recordId = extractRecordId(a.payload);
          if (recordId) {
            if (!autoSaveScheduler) {
              autoSaveScheduler = createAutoSaveScheduler({
                policies: ctx.policies,
                store: {
                  getState: api.getState,
                  dispatch: api.dispatch,
                } as Parameters<typeof createAutoSaveScheduler>[0]["store"],
                getIdentity: ctx.getIdentity,
                ...(ctx.defaultDebounceMs !== undefined
                  ? { defaultDebounceMs: ctx.defaultDebounceMs }
                  : {}),
              });
            }
            for (const policy of triggered) {
              autoSaveScheduler.schedule(policy.config.sliceName, recordId);
            }
          }
        }
      }

      // --- Persist (sync write-through for boot-critical; debounced for warm-cache) ---
      // Rehydrate actions flow through reducers but must NOT trigger a re-persist.
      if (!isRehydrateAction(a)) {
        for (const policy of ctx.policies) {
          const caps = getPreset(policy.config.preset);
          if (caps.writeStrategy === "none") continue;
          // Only write when the slice state reference changed.
          const sliceState = selectSliceState(
            api.getState(),
            policy.config.sliceName,
          );
          if (sliceState === undefined) continue;
          if (lastPersistedRef.get(policy.config.sliceName) === sliceState)
            continue;
          lastPersistedRef.set(policy.config.sliceName, sliceState);

          const body = serializeBody(policy, sliceState);

          if (caps.writeStrategy === "sync") {
            // boot-critical: synchronous localStorage write-through.
            adapterFor(policy).write(policy.storageKey, {
              version: policy.config.version,
              identityKey: ctx.getIdentity().key,
              body,
            });
          } else if (caps.writeStrategy === "debounced") {
            // warm-cache: debounced write — both IDB and remote.write
            // (if declared) flush after quiescence. Lazy scheduler
            // construction on first use.
            if (!remoteWriteScheduler) {
              remoteWriteScheduler = createRemoteWriteScheduler({
                policies: ctx.policies,
                store: {
                  getState: api.getState,
                  dispatch: api.dispatch,
                } as Parameters<typeof createRemoteWriteScheduler>[0]["store"],
                getIdentity: ctx.getIdentity,
                ...(ctx.defaultDebounceMs !== undefined
                  ? { defaultDebounceMs: ctx.defaultDebounceMs }
                  : {}),
              });
            }
            remoteWriteScheduler.schedule(policy.config.sliceName, body);
          }
        }
      } else {
        // REHYDRATE path: the reducer just replaced slice state with data
        // pulled from a persistent source (IDB, LS fallback, remote.fetch,
        // or peer HYDRATE_RESPONSE). That new state IS the persisted
        // baseline — update `lastPersistedRef` so the first subsequent
        // mutation is compared against it. Without this, a user edit
        // right after rehydrate would be detected as "changed since boot
        // seed" and flushed back to the same source we just read from.
        for (const policy of ctx.policies) {
          const caps = getPreset(policy.config.preset);
          if (caps.writeStrategy === "none") continue;
          const sliceState = selectSliceState(
            api.getState(),
            policy.config.sliceName,
          );
          if (sliceState !== undefined) {
            lastPersistedRef.set(policy.config.sliceName, sliceState);
          }
        }
      }
      void hasWarmCache;

      // --- Apply pre-paint descriptors at runtime ---
      // Mirrors the one-shot inline SyncBootScript so DOM class/attribute
      // state stays in lockstep with Redux for local toggles, inbound
      // broadcasts, AND rehydrate (boot). Idempotent: skips if slice state
      // reference didn't change.
      for (const policy of ctx.policies) {
        if (policy.prePaintDescriptors.length === 0) continue;
        const sliceState = selectSliceState(
          api.getState(),
          policy.config.sliceName,
        );
        if (sliceState === undefined) continue;
        if (lastAppliedRef.get(policy.config.sliceName) === sliceState)
          continue;
        lastAppliedRef.set(policy.config.sliceName, sliceState);
        try {
          applyPrePaintDescriptors(
            policy.prePaintDescriptors,
            sliceState as Record<string, unknown>,
          );
        } catch (err) {
          logger.error("apply.prePaint.failed", {
            sliceName: policy.config.sliceName,
            meta: { error: extractErrorMessage(err) },
          });
        }
      }

      return result;
    };

  return middleware;
}
