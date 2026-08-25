/**
 * Run Sets — the surface-keyed, ORDERED collection of live agent runs and
 * non-stream data payloads that one UI surface displays together.
 *
 * 🚨 WHY THIS EXISTS (read /Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/LIVE-RUN-RETENTION.md first):
 * launcher hooks keep their run identity (requestId, status) in component
 * state, so ANY remount of the surface — a tab switch, a query-driven
 * re-render upstream, a `key=` change — loses which runs the surface was
 * showing even when the streamed rows still exist in `activeRequests`. And
 * surfaces that fire MULTIPLE agent calls (a pipeline per phase, a batch per
 * node, a run per keyword) have nowhere to keep the ordered set at all: every
 * hook holds exactly one `requestId` and destroys the previous one. This
 * slice is that missing home. Entries live in Redux under a caller-chosen
 * stable `setKey`, so a remounted surface re-attaches to everything it was
 * displaying, and a finished run's content stays addressable while the next
 * one streams.
 *
 * The slice stores ONLY set membership + labels. Streamed content stays in
 * `activeRequests` (never duplicated), and non-stream payloads are stored as
 * canonical `ServerProcessedBlock`-shaped entries rendered through the ONE
 * pipeline (`MarkdownStream serverProcessedBlocks`) — never a bespoke
 * renderer.
 *
 * ROW LIFETIME: adding a run to a set does NOT itself retain the
 * `activeRequests` row — retention stays viewer-scoped (the mounted
 * `RunSetDisplay`/`MarkdownStream` holds it, per /Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/LIVE-RUN-RETENTION.md).
 * Membership additionally CANCELS owner reaps while the set exists via the
 * set-hold thunks in run-sets.thunks.ts. Always add/clear through those
 * thunks (`addRunToSet` / `clearRunSet` / `removeRunSetEntry`), never by
 * dispatching these reducers directly, or rows leak or die early.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/** One displayed unit on a multi-run surface, in display order. */
export type RunSetEntry =
  | {
      kind: "run";
      /** Entry identity — for runs this IS the requestId. */
      id: string;
      requestId: string;
      /** Short human label ("Keyword research — brain", "Pass 2 of 7"). */
      label: string;
      addedAt: string;
    }
  | {
      kind: "data";
      id: string;
      label: string;
      /** Canonical block payload — rendered via the ONE pipeline. */
      block: {
        blockId: string;
        blockIndex: number;
        type: string;
        status: "streaming" | "complete" | "error";
        content?: string | null;
        data?: Record<string, unknown> | null;
        metadata?: Record<string, unknown>;
      };
      addedAt: string;
    };

export interface RunSetsState {
  bySetKey: Record<string, RunSetEntry[]>;
}

/** Entries beyond this per-set cap are evicted oldest-first (the eviction
 * thunk releases their rows). A display surface showing more than this many
 * concurrent runs has outgrown a rail and needs its own design. */
export const RUN_SET_MAX_ENTRIES = 20;

const initialState: RunSetsState = { bySetKey: {} };

const runSetsSlice = createSlice({
  name: "runSets",
  initialState,
  reducers: {
    /** INTERNAL — dispatch via addRunToSet (it also places the set hold). */
    runSetEntryAdded(
      state,
      action: PayloadAction<{ setKey: string; entry: RunSetEntry }>,
    ) {
      const { setKey, entry } = action.payload;
      const entries = state.bySetKey[setKey] ?? [];
      const existing = entries.findIndex((item) => item.id === entry.id);
      if (existing >= 0) {
        // Same identity re-announced (re-adoption after reconnect): update
        // the label in place, keep the original position and timestamp.
        entries[existing] = { ...entries[existing], label: entry.label };
      } else {
        entries.push(entry);
      }
      state.bySetKey[setKey] = entries;
    },

    /** INTERNAL — dispatch via removeRunSetEntry / clearRunSet. */
    runSetEntryRemoved(
      state,
      action: PayloadAction<{ setKey: string; id: string }>,
    ) {
      const { setKey, id } = action.payload;
      const entries = state.bySetKey[setKey];
      if (!entries) return;
      const remaining = entries.filter((item) => item.id !== id);
      if (remaining.length === 0) {
        delete state.bySetKey[setKey];
      } else {
        state.bySetKey[setKey] = remaining;
      }
    },

    /** INTERNAL — dispatch via clearRunSet. */
    runSetCleared(state, action: PayloadAction<{ setKey: string }>) {
      delete state.bySetKey[action.payload.setKey];
    },
  },
});

export const { runSetEntryAdded, runSetEntryRemoved, runSetCleared } =
  runSetsSlice.actions;

export default runSetsSlice.reducer;

/** Stable empty list so selectors never mint a fresh array per call. */
const EMPTY_ENTRIES: RunSetEntry[] = [];

export const selectRunSetEntries = (
  state: { runSets: RunSetsState },
  setKey: string,
): RunSetEntry[] => state.runSets.bySetKey[setKey] ?? EMPTY_ENTRIES;
