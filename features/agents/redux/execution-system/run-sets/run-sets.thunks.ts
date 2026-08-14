/**
 * Run Set thunks — the ONLY sanctioned write path to the run-sets slice.
 *
 * Each thunk pairs set membership with the `activeRequests` retention hold
 * that keeps the row alive for the life of the set ("set hold"): an owner
 * hook's reap (`removeRequest` on unmount / pre-next-run) then DEFERS until
 * the entry leaves the set, exactly like a mounted viewer's hold — see
 * features/agents/docs/LIVE_RUN_RETENTION.md. This is what lets a surface
 * remount and find every run it was displaying still fully streamed.
 *
 * Never dispatch the slice's internal reducers directly: adding without the
 * hold re-creates the mid-run vanish; clearing without the release leaks one
 * row (with its full raw event log) per run for the tab's lifetime.
 */

import type { AppThunk } from "@/lib/redux/store";

import {
  releaseRequestForViewer,
  retainRequestForViewer,
} from "../active-requests/active-requests.slice";
import {
  RUN_SET_MAX_ENTRIES,
  runSetCleared,
  runSetEntryAdded,
  runSetEntryRemoved,
  selectRunSetEntries,
  type RunSetEntry,
} from "./run-sets.slice";

const holdViewerId = (setKey: string, requestId: string) =>
  `run-set:${setKey}:${requestId}`;

/** Add a live run to a surface's set (idempotent per requestId). */
export function addRunToSet(input: {
  setKey: string;
  requestId: string;
  label: string;
}): AppThunk {
  return (dispatch, getState) => {
    const { setKey, requestId, label } = input;
    if (!requestId) return;
    const existing = selectRunSetEntries(getState(), setKey);
    const already = existing.some(
      (entry) => entry.kind === "run" && entry.requestId === requestId,
    );
    if (!already) {
      dispatch(
        retainRequestForViewer({
          requestId,
          viewerId: holdViewerId(setKey, requestId),
        }),
      );
    }
    dispatch(
      runSetEntryAdded({
        setKey,
        entry: {
          kind: "run",
          id: requestId,
          requestId,
          label,
          addedAt: new Date().toISOString(),
        },
      }),
    );
    evictOverflow(setKey, dispatch, getState);
  };
}

/** Add a non-stream payload (an API response, a persisted artifact) as a
 * canonical block entry, rendered through the ONE pipeline. */
export function addDataToSet(input: {
  setKey: string;
  /** Stable identity — re-adding the same id updates in place. */
  id: string;
  label: string;
  block: Extract<RunSetEntry, { kind: "data" }>["block"];
}): AppThunk {
  return (dispatch, getState) => {
    dispatch(
      runSetEntryAdded({
        setKey: input.setKey,
        entry: {
          kind: "data",
          id: input.id,
          label: input.label,
          block: input.block,
          addedAt: new Date().toISOString(),
        },
      }),
    );
    evictOverflow(input.setKey, dispatch, getState);
  };
}

/** Remove one entry, releasing its set hold (a run row with no other viewers
 * and a pending owner reap is deleted at this moment). */
export function removeRunSetEntry(input: {
  setKey: string;
  id: string;
}): AppThunk {
  return (dispatch, getState) => {
    const entries = selectRunSetEntries(getState(), input.setKey);
    const entry = entries.find((item) => item.id === input.id);
    if (!entry) return;
    dispatch(runSetEntryRemoved({ setKey: input.setKey, id: input.id }));
    if (entry.kind === "run") {
      dispatch(
        releaseRequestForViewer({
          requestId: entry.requestId,
          viewerId: holdViewerId(input.setKey, entry.requestId),
        }),
      );
    }
  };
}

/** Drop the whole set, releasing every held row. Call when the surface
 * starts a NEW logical session (not on unmount — surviving unmount is the
 * point). */
export function clearRunSet(setKey: string): AppThunk {
  return (dispatch, getState) => {
    const entries = selectRunSetEntries(getState(), setKey);
    dispatch(runSetCleared({ setKey }));
    for (const entry of entries) {
      if (entry.kind === "run") {
        dispatch(
          releaseRequestForViewer({
            requestId: entry.requestId,
            viewerId: holdViewerId(setKey, entry.requestId),
          }),
        );
      }
    }
  };
}

function evictOverflow(
  setKey: string,
  dispatch: Parameters<AppThunk>[0],
  getState: Parameters<AppThunk>[1],
) {
  const entries = selectRunSetEntries(getState(), setKey);
  const overflow = entries.length - RUN_SET_MAX_ENTRIES;
  if (overflow <= 0) return;
  for (const entry of entries.slice(0, overflow)) {
    dispatch(removeRunSetEntry({ setKey, id: entry.id }));
  }
}
