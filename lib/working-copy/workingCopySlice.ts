/**
 * lib/working-copy/workingCopySlice.ts — THE working copy of every record being
 * edited, in Redux, keyed by `${entity}:${id}` (`workingCopyKey`).
 *
 * THE LAW (owner, 2026-10-02): every screen survives hide/show/remount with no
 * lost work and no repeated side effects. A record's working state lives here;
 * every editor that shows it is a VIEW of this entry. One entry per record per
 * tab, whatever number of views (a board tile, the record's page, a side
 * panel, a canvas tab) show it.
 *
 * What lives here is the state of record — the text (`value`, for text
 * records: a note's body, a file's text), what it was loaded / saved as
 * (`base`, `baseVersion`), dirty, save status, the number of views. A record
 * whose body is held by a non-serializable editor engine (a Univer document)
 * keeps `value` undefined: the engine lives in the module registry keyed the
 * same way (`./workingCopyKind.ts`), and this entry carries its status.
 *
 * Writes go through `defineWorkingCopyKind` (one coalesced save path per
 * record, ref-counted views) — never dispatch the save actions by hand.
 */

import { createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type WorkingCopyStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface WorkingCopyEntry {
  /** What the person sees and edits (text records). Undefined: the record's own store / engine holds it. */
  value?: string;
  /** What `value` was last loaded from or saved as. */
  base?: string;
  /** The stored version `base` belongs to (null when unknown). */
  baseVersion: number | null;
  /** Bumped by every edit; a save records the number it wrote. */
  editSeq: number;
  savingSeq: number | null;
  savedSeq: number;
  /** Unsaved work exists (text records: `value !== base`; others: an edit since the last save). */
  dirty: boolean;
  status: WorkingCopyStatus;
  saveError: string | null;
  /** ms timestamp of the last successful save. */
  savedAt: number | null;
  /** Editors showing this record right now. */
  views: number;
}

export interface WorkingCopiesState {
  byKey: Record<string, WorkingCopyEntry>;
}

const initialState: WorkingCopiesState = { byKey: {} };

export function workingCopyKey(entity: string, id: string): string {
  return `${entity}:${id}`;
}

function blankEntry(): WorkingCopyEntry {
  return {
    baseVersion: null,
    editSeq: 0,
    savingSeq: null,
    savedSeq: 0,
    dirty: false,
    status: "idle",
    saveError: null,
    savedAt: null,
    views: 0,
  };
}

function entryFor(state: WorkingCopiesState, key: string): WorkingCopyEntry {
  let entry = state.byKey[key];
  if (!entry) {
    entry = blankEntry();
    state.byKey[key] = entry;
  }
  return entry;
}

function recomputeDirty(entry: WorkingCopyEntry): void {
  entry.dirty =
    entry.value !== undefined
      ? entry.value !== entry.base
      : entry.editSeq !== entry.savedSeq;
}

const workingCopySlice = createSlice({
  name: "workingCopies",
  initialState,
  reducers: {
    workingCopyViewAttached(state, action: PayloadAction<{ key: string }>) {
      entryFor(state, action.payload.key).views += 1;
    },
    workingCopyViewDetached(state, action: PayloadAction<{ key: string }>) {
      const entry = state.byKey[action.payload.key];
      if (entry) entry.views = Math.max(0, entry.views - 1);
    },
    /**
     * The record's stored value arrived or moved (first open, a fetch, realtime,
     * undo, new bytes for a new version). A clean copy follows it; a dirty copy
     * keeps the person's text and is now compared with it. `draft` is unsaved
     * text kept from before a reload — it applies only when there is no copy yet.
     */
    workingCopySourceLoaded(
      state,
      action: PayloadAction<{ key: string; value: string; version?: number | null; draft?: string | null }>,
    ) {
      const { key, value, version, draft } = action.payload;
      const entry = entryFor(state, key);
      if (entry.value === undefined) {
        entry.value = draft != null ? draft : value;
      } else if (!entry.dirty && entry.status !== "saving") {
        entry.value = value;
      }
      entry.base = value;
      if (version !== undefined) entry.baseVersion = version;
      recomputeDirty(entry);
      if (entry.status !== "saving" && entry.status !== "error") entry.status = entry.dirty ? "dirty" : "idle";
    },
    /** A local edit (text records). */
    workingCopyEdited(state, action: PayloadAction<{ key: string; value: string }>) {
      const entry = entryFor(state, action.payload.key);
      if (entry.value === action.payload.value) return;
      if (entry.base === undefined) entry.base = entry.value ?? "";
      entry.value = action.payload.value;
      entry.editSeq += 1;
      recomputeDirty(entry);
      if (entry.status !== "saving") entry.status = entry.dirty ? "dirty" : "idle";
    },
    /** A local edit to a record whose body an engine holds (a Univer document). */
    workingCopyTouched(state, action: PayloadAction<{ key: string }>) {
      const entry = entryFor(state, action.payload.key);
      entry.editSeq += 1;
      recomputeDirty(entry);
      if (entry.status !== "saving") entry.status = "dirty";
    },
    workingCopySaveStarted(state, action: PayloadAction<{ key: string }>) {
      const entry = entryFor(state, action.payload.key);
      entry.status = "saving";
      entry.savingSeq = entry.editSeq;
      entry.saveError = null;
    },
    /** `value` is what was written (text records); anything edited meanwhile stays unsaved. */
    workingCopySaved(
      state,
      action: PayloadAction<{ key: string; value?: string; version?: number | null; savedAt: number | null }>,
    ) {
      const entry = state.byKey[action.payload.key];
      if (!entry) return;
      entry.savedSeq = entry.savingSeq ?? entry.editSeq;
      entry.savingSeq = null;
      if (action.payload.value !== undefined) entry.base = action.payload.value;
      if (action.payload.version !== undefined) entry.baseVersion = action.payload.version;
      if (action.payload.savedAt !== null) entry.savedAt = action.payload.savedAt;
      entry.saveError = null;
      recomputeDirty(entry);
      entry.status = entry.dirty ? "dirty" : action.payload.savedAt !== null ? "saved" : "idle";
    },
    workingCopySaveFailed(state, action: PayloadAction<{ key: string; error: string }>) {
      const entry = state.byKey[action.payload.key];
      if (!entry) return;
      entry.savingSeq = null;
      entry.status = "error";
      entry.saveError = action.payload.error;
    },
    /** "Saved" fades to idle. */
    workingCopySettled(state, action: PayloadAction<{ key: string }>) {
      const entry = state.byKey[action.payload.key];
      if (entry && entry.status === "saved") entry.status = "idle";
    },
    /** Throw the unsaved edit away (back to what is stored). */
    workingCopyDiscarded(state, action: PayloadAction<{ key: string }>) {
      const entry = state.byKey[action.payload.key];
      if (!entry) return;
      if (entry.base !== undefined) entry.value = entry.base;
      entry.savedSeq = entry.editSeq;
      entry.saveError = null;
      recomputeDirty(entry);
      entry.status = "idle";
    },
    /** The record already holds `value` (a resolved conflict): show it, nothing pending. */
    workingCopyReset(state, action: PayloadAction<{ key: string; value: string }>) {
      const entry = entryFor(state, action.payload.key);
      entry.value = action.payload.value;
      entry.base = action.payload.value;
      entry.savedSeq = entry.editSeq;
      entry.saveError = null;
      recomputeDirty(entry);
      entry.status = "idle";
    },
    /** No view, nothing pending: the record's own store is the truth again. */
    workingCopyReleased(state, action: PayloadAction<{ key: string }>) {
      const entry = state.byKey[action.payload.key];
      if (entry && entry.views === 0 && !entry.dirty && entry.status !== "saving") {
        delete state.byKey[action.payload.key];
      }
    },
  },
});

export const {
  workingCopyViewAttached,
  workingCopyViewDetached,
  workingCopySourceLoaded,
  workingCopyEdited,
  workingCopyTouched,
  workingCopySaveStarted,
  workingCopySaved,
  workingCopySaveFailed,
  workingCopySettled,
  workingCopyDiscarded,
  workingCopyReset,
  workingCopyReleased,
} = workingCopySlice.actions;

export default workingCopySlice.reducer;

export type WithWorkingCopies = { workingCopies?: WorkingCopiesState };

const selectByKey = (state: WithWorkingCopies) => state.workingCopies?.byKey;

/** Non-React read (thunks, middleware, draft rescue). */
export function getWorkingCopy(state: WithWorkingCopies, key: string): WorkingCopyEntry | undefined {
  return state.workingCopies?.byKey[key];
}

/** One record's entry (memoized per key). */
export const selectWorkingCopy = createSelector(
  [selectByKey, (_state: WithWorkingCopies, key: string) => key],
  (byKey, key): WorkingCopyEntry | undefined => byKey?.[key],
);

/** One record's working text, or undefined when no view holds newer text than the record. */
export const selectWorkingCopyValue = createSelector(
  [selectWorkingCopy],
  (entry): string | undefined => entry?.value,
);

export const selectWorkingCopyStatus = createSelector(
  [selectWorkingCopy],
  (entry): WorkingCopyStatus | undefined => entry?.status,
);
