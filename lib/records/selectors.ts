/**
 * lib/records/selectors.ts
 *
 * Selector factory for durable records. A feature passes in one accessor —
 * `selectRecordsMap: (state) => Record<id, TrackedRecord<T>>` pointing at its
 * single canonical slice — and gets back memoized, id-curried selectors for
 * dirty / saving / save-state / changes.
 *
 * Re-render + loop safety (the notes lesson, `features/notes/redux/selectors.ts`):
 * id-parametrized selectors are CACHED per id so `useAppSelector(s => sel(s, id))`
 * returns the SAME selector instance across renders — never a fresh closure that
 * defeats memoization or triggers the "selector returned a different value"
 * loop. Scalar outputs (booleans/strings) keep component subscriptions tight.
 */

import { createSelector } from "@reduxjs/toolkit";
import { getRecordChanges, getSaveState } from "./tracking";
import type { RecordFieldChange, SaveState, TrackedRecord } from "./types";

export interface TrackingSelectors<RootState, T> {
  selectRecord: (state: RootState, id: string) => TrackedRecord<T> | undefined;
  selectIsDirty: (state: RootState, id: string) => boolean;
  selectIsSaving: (state: RootState, id: string) => boolean;
  selectError: (state: RootState, id: string) => string | null;
  selectSaveState: (state: RootState, id: string) => SaveState;
  selectChanges: (state: RootState, id: string) => RecordFieldChange[];
  selectCanUndo: (state: RootState, id: string) => boolean;
  selectCanRedo: (state: RootState, id: string) => boolean;
  /** True if ANY record in the slice is dirty (for global leave-guards). */
  selectAnyDirty: (state: RootState) => boolean;
}

const EMPTY_CHANGES: RecordFieldChange[] = [];

export function createTrackingSelectors<RootState, T>(
  selectRecordsMap: (state: RootState) => Record<string, TrackedRecord<T>>,
): TrackingSelectors<RootState, T> {
  const selectRecord = (state: RootState, id: string) =>
    selectRecordsMap(state)[id];

  // Per-id selector caches — each id gets ONE memoized selector instance.
  const changesCache = new Map<
    string,
    (state: RootState) => RecordFieldChange[]
  >();
  const saveStateCache = new Map<string, (state: RootState) => SaveState>();

  const selectChanges = (state: RootState, id: string) => {
    let sel = changesCache.get(id);
    if (!sel) {
      sel = createSelector([(s: RootState) => selectRecord(s, id)], (record) =>
        record ? getRecordChanges(record) : EMPTY_CHANGES,
      );
      changesCache.set(id, sel);
    }
    return sel(state);
  };

  const selectSaveState = (state: RootState, id: string) => {
    let sel = saveStateCache.get(id);
    if (!sel) {
      sel = createSelector([(s: RootState) => selectRecord(s, id)], (record) =>
        getSaveState(record),
      );
      saveStateCache.set(id, sel);
    }
    return sel(state);
  };

  const selectAnyDirty = createSelector([selectRecordsMap], (map) => {
    for (const id in map) if (map[id]?._dirty) return true;
    return false;
  });

  return {
    selectRecord,
    selectIsDirty: (state, id) => selectRecord(state, id)?._dirty ?? false,
    selectIsSaving: (state, id) => selectRecord(state, id)?._saving ?? false,
    selectError: (state, id) => selectRecord(state, id)?._error ?? null,
    selectSaveState,
    selectChanges,
    selectCanUndo: (state, id) =>
      (selectRecord(state, id)?._undoPast.length ?? 0) > 0,
    selectCanRedo: (state, id) =>
      (selectRecord(state, id)?._undoFuture.length ?? 0) > 0,
    selectAnyDirty,
  };
}
