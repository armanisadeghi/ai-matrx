/**
 * fsChangesSlice — canonical store for `RESOURCE_CHANGED` stream events.
 *
 * The Python backend emits a single `resource_changed` event on every
 * filesystem mutation the agent performs (matrx-ai's `fs_write`,
 * `fs_patch`, `fs_mkdir` today; future tools layer on without schema
 * changes). The same event shape will eventually carry non-fs kinds
 * (`cld_files`, `sandbox.cwd`, `cache.*` — see the spec at
 * `features/code/SANDBOX_PROXY_AND_FS_EVENTS_FE_INTEGRATION.md`).
 *
 * Responsibilities of this slice:
 *   1. Buffer recent changes (per-sandbox ring) so the UI can show
 *      "recently modified" badges, debug timelines, and conflict toasts.
 *   2. Maintain a fast O(1) lookup from a canonical resource id to the
 *      most-recent change — that's how the editor tab manager decides
 *      whether to refresh or surface a conflict toast.
 *   3. Stay extensible. We branch on `kind` at every consumer; unknown
 *      kinds are stored verbatim (so a future "cld_files" event lands
 *      in the slice with no code changes here) but only `fs.*` kinds
 *      have first-class wiring today.
 *
 * Important: the editor tab refresh logic does NOT live here. This slice
 * is the canonical "what changed and when" log. The hook
 * `useApplyFsChangesToOpenTabs` (in `features/code/agent-context`)
 * subscribes, decides per-tab refresh vs conflict, and writes back
 * through the existing `replaceTabContent` action so the save pipeline
 * stays intact.
 */

import { createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ResourceChangedPayload } from "@/types/python-generated/stream-events";

type ResourceChangedKind = ResourceChangedPayload["kind"];
type ResourceChangedAction = ResourceChangedPayload["action"];
type ResourceChangedMetadata = NonNullable<ResourceChangedPayload["metadata"]>;

/**
 * Hard cap on the per-bucket ring buffer. Anything beyond this gets
 * dropped from the head — the slice is for "what just happened" UX
 * (badges, conflict toasts, debug panels), not durable history.
 */
export const FS_CHANGES_RING_SIZE = 200;

/** Single change record — one per inbound `resource_changed` event. */
export interface FsChange {
  /** Monotonic id assigned at dispatch — used to dedup React renders. */
  seq: number;
  kind: ResourceChangedKind;
  action: ResourceChangedAction;
  /** Canonical resource id. For `fs.*` kinds this is the absolute path. */
  resourceId: string;
  /** `null` when the change came from the global server (cloud kinds). */
  sandboxId: string | null;
  userId: string | null;
  metadata: ResourceChangedMetadata;
  /** Epoch ms — for dedup + UX timestamps + ring eviction. */
  receivedAt: number;
  /** Stream that delivered this change — handy for debug panels. */
  requestId?: string;
  /** Conversation that delivered the change — handy for cross-surface dedup. */
  conversationId?: string;
}

/**
 * Bucket key — we segregate changes by sandbox (or "global" when no
 * `sandbox_id`) so the editor tab manager can refresh only what's
 * relevant to the surface that's currently mounted. A single global
 * ring would force every sandbox-mounted hook to filter on every
 * action, which gets painful with multiple long-lived sandboxes.
 */
export const GLOBAL_BUCKET_KEY = "__global__";

export interface FsChangesBucket {
  /** Ring buffer (oldest → newest). Capped at FS_CHANGES_RING_SIZE. */
  ring: FsChange[];
  /** Most-recent change keyed by `resourceId` for O(1) consumer lookup. */
  lastByResourceId: Record<string, FsChange>;
}

export interface FsChangesState {
  /** Per-sandbox bucket; "global" lives under GLOBAL_BUCKET_KEY. */
  byBucket: Record<string, FsChangesBucket>;
  /** Monotonic counter — incremented on every received change. */
  nextSeq: number;
  /** Most-recent change overall — handy for tiny "live" badges. */
  lastReceivedAt: number | null;
}

const initialState: FsChangesState = {
  byBucket: {},
  nextSeq: 1,
  lastReceivedAt: null,
};

function ensureBucket(state: FsChangesState, key: string): FsChangesBucket {
  let bucket = state.byBucket[key];
  if (!bucket) {
    bucket = { ring: [], lastByResourceId: {} };
    state.byBucket[key] = bucket;
  }
  return bucket;
}

function pushToRing(bucket: FsChangesBucket, change: FsChange) {
  bucket.ring.push(change);
  // Evict the head until we're back at the cap. This is O(1) per change
  // because the ring almost always grows by one and then trims by one;
  // there's no need to reach for a circular buffer.
  while (bucket.ring.length > FS_CHANGES_RING_SIZE) {
    const evicted = bucket.ring.shift();
    if (!evicted) break;
    // Only erase the lookup row if no later entry has reset it. Otherwise
    // the next-most-recent change (which DOES still live in the ring)
    // would lose its lookup binding.
    if (bucket.lastByResourceId[evicted.resourceId] === evicted) {
      delete bucket.lastByResourceId[evicted.resourceId];
    }
  }
}

const slice = createSlice({
  name: "fsChanges",
  initialState,
  reducers: {
    /**
     * Record a `resource_changed` event. Caller owns translation from
     * the Python wire payload (snake_case) into this camelCase shape.
     * Dispatched from `processStream` for every NDJSON event.
     */
    received: {
      reducer(
        state,
        action: PayloadAction<Omit<FsChange, "seq"> & { seq?: number }>,
      ) {
        const seq = action.payload.seq ?? state.nextSeq;
        if (seq >= state.nextSeq) state.nextSeq = seq + 1;

        const change: FsChange = { ...action.payload, seq };
        const bucketKey = change.sandboxId ?? GLOBAL_BUCKET_KEY;
        const bucket = ensureBucket(state, bucketKey);
        pushToRing(bucket, change);
        bucket.lastByResourceId[change.resourceId] = change;
        state.lastReceivedAt = change.receivedAt;
      },
      // Make `seq` optional at the call site — the reducer fills it in
      // from `nextSeq` when the caller doesn't supply one.
      prepare(payload: Omit<FsChange, "seq">) {
        return {
          payload: { ...payload, seq: undefined as number | undefined },
        };
      },
    },
    /**
     * Wipe a single bucket — used when a sandbox is destroyed/forgotten.
     * The hook layer should clear the bucket as part of disconnect to
     * stop stale path lookups from triggering reload-after-disconnect.
     */
    clearBucket(state, action: PayloadAction<string>) {
      delete state.byBucket[action.payload];
    },
    /**
     * Drop a single resource's lookup row WITHOUT touching the ring.
     * Used by consumers that have "consumed" a change (e.g. a tab
     * accepted the reload) so the next render doesn't keep nagging.
     */
    acknowledgeResource(
      state,
      action: PayloadAction<{ bucketKey: string; resourceId: string }>,
    ) {
      const bucket = state.byBucket[action.payload.bucketKey];
      if (!bucket) return;
      delete bucket.lastByResourceId[action.payload.resourceId];
    },
    /** Wipe everything — typically only used in tests / dev tools. */
    reset() {
      return initialState;
    },
  },
});

export const {
  received: receivedFsChange,
  clearBucket: clearFsChangesBucket,
  acknowledgeResource: acknowledgeFsChange,
  reset: resetFsChanges,
} = slice.actions;

export default slice.reducer;

// ─── Selectors ──────────────────────────────────────────────────────────────

type WithFsChanges = { fsChanges: FsChangesState };

const EMPTY_BUCKET: FsChangesBucket = Object.freeze({
  ring: [],
  lastByResourceId: {},
}) as FsChangesBucket;

export const selectFsChangesState = (state: WithFsChanges) =>
  state.fsChanges ?? initialState;

export const selectFsChangesBucket = (
  state: WithFsChanges,
  bucketKey: string,
): FsChangesBucket =>
  selectFsChangesState(state).byBucket[bucketKey] ?? EMPTY_BUCKET;

/**
 * Last change for a specific resource id, or `null` when nothing matches.
 * Use this in the tab-content hook with `bucketKey = sandboxId` so we
 * only react to changes for the currently-mounted filesystem.
 */
export const selectLastChangeForResource = (
  state: WithFsChanges,
  bucketKey: string,
  resourceId: string,
): FsChange | null =>
  selectFsChangesBucket(state, bucketKey).lastByResourceId[resourceId] ?? null;

/**
 * Memoized — returns the bucket's lookup table reference if it hasn't
 * changed. Components that subscribe to the whole map (like a file-tree
 * "recently changed" badge layer) should use this; per-resource
 * subscribers should prefer `selectLastChangeForResource` to keep
 * re-renders scoped.
 */
export const makeSelectChangesByResourceId = (bucketKey: string) =>
  createSelector(
    [(state: WithFsChanges) => selectFsChangesBucket(state, bucketKey)],
    (bucket) => bucket.lastByResourceId,
  );

/**
 * Most-recent N changes for a bucket, newest first. Used by the debug
 * panel "FS changes" tab.
 */
export const makeSelectRecentChanges = (bucketKey: string, limit = 25) =>
  createSelector(
    [(state: WithFsChanges) => selectFsChangesBucket(state, bucketKey)],
    (bucket) => bucket.ring.slice(-limit).reverse(),
  );

export const selectLastFsChangeAt = (state: WithFsChanges) =>
  selectFsChangesState(state).lastReceivedAt;
