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

export type WorkingCopyStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

/**
 * The record's stored state moved while this copy held unsaved work that
 * started from an older base. Nothing is written until the person chooses
 * (keep mine / take theirs / merge) — never a silent last-write-wins.
 */
export interface WorkingCopyConflict {
  /** The stored text now (text records). Undefined: an engine record, or text not read. */
  theirs?: string;
  /** The stored version `theirs` belongs to (null when unknown). */
  theirsVersion: number | null;
  /** The text the person's edit started from — what a merge needs (text records). */
  ancestor?: string;
  /** Engine records: an opaque id of the stored state that moved (a snapshot row). */
  theirsRef?: string | null;
}

/** The last save failed; `permanent` ones (permission, conflict) wait for the person. */
export interface WorkingCopySaveFailure {
  permanent: boolean;
  /** Failed attempts in a row since the last successful save. */
  attempts: number;
  /** ms timestamp of the next automatic retry; null = none scheduled (permanent, or parked). */
  retryAt: number | null;
}

export interface WorkingCopyEntry {
  /** What the person sees and edits (text records). Undefined: the record's own store / engine holds it. */
  value?: string;
  /** What `value` was last loaded from or saved as. */
  base?: string;
  /** The stored version `base` belongs to (null when unknown). */
  baseVersion: number | null;
  /** Bumped by every edit; a save records the number it wrote. */
  editSeq: number;
  /**
   * Text records: the edit number of the last `touch` — the record holds
   * unsaved work the text does not show (a note's renamed title, its folder).
   * Unsaved until a save that started at or after it lands.
   */
  touchedSeq?: number | null;
  savingSeq: number | null;
  savedSeq: number;
  /** Unsaved work exists (text records: `value !== base`; others: an edit since the last save). */
  dirty: boolean;
  status: WorkingCopyStatus;
  saveError: string | null;
  /** The last save failed and nothing has saved since (see `WorkingCopySaveFailure`). */
  failure: WorkingCopySaveFailure | null;
  /** The stored state moved under unsaved work; saving waits for the person's choice. */
  conflict: WorkingCopyConflict | null;
  /** Text records: the value a save in flight is writing (its echo is not a conflict). */
  writing?: string;
  /** ms timestamp of the last successful save. */
  savedAt: number | null;
  /** Editors showing this record right now. */
  views: number;
  /**
   * The record's metadata as last read (its row, the person's edit gate), so a
   * view that remounts or wakes reads nothing again. Serializable; set by the
   * kind's views (`kind.setRecord`).
   */
  record?: unknown;
}

/** Where the caret / selection was in a record's text the last time a view of it went away. */
export interface KeptTextSelection {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
}

/** A caret / selection of the rich editor, as the text around its ends (the editor's `getCaret`). */
export interface KeptRichCaret {
  from: { before: string; after: string };
  to: { before: string; after: string } | null;
}

export interface WorkingCopiesState {
  byKey: Record<string, WorkingCopyEntry>;
  /**
   * The caret / selection per record key, kept apart from `byKey` because an
   * entry is dropped when its last view leaves — and a view that mounts again
   * (a remount, a removed tile undone) must put the caret back where the
   * person left it (`useKeptTextSelection`).
   */
  selections?: Record<string, KeptTextSelection>;
  /**
   * The same for THE ONE EDITOR (Write / Source): its caret as text around its
   * ends (`useKeptRichCaret`), because a rich view has no textarea offsets.
   */
  richCarets?: Record<string, KeptRichCaret>;
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
    failure: null,
    conflict: null,
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
  if (entry.value === undefined) {
    entry.dirty = entry.editSeq !== entry.savedSeq;
    return;
  }
  const touched = entry.touchedSeq != null && entry.touchedSeq > entry.savedSeq;
  entry.dirty = entry.value !== entry.base || touched;
}

/** Status from the entry's facts (a save in flight keeps "saving"). */
function settleStatus(entry: WorkingCopyEntry): void {
  if (entry.status === "saving") return;
  if (entry.conflict) entry.status = "conflict";
  else if (entry.failure) entry.status = "error";
  else entry.status = entry.dirty ? "dirty" : "idle";
}

/**
 * THE CONFLICT RULE. The stored value is `value` now. A copy with no unsaved
 * work follows it. A copy with unsaved work keeps the person's text; the
 * source moving is then either nothing new (it still holds the base, it now
 * holds the person's own text, or it is the echo of the write in flight) or a
 * CONFLICT: someone else's edit landed on the base this copy started from.
 */
function applySource(entry: WorkingCopyEntry, value: string, version: number | null | undefined): void {
  if (entry.conflict) {
    if (value === entry.value) {
      // The stored text now IS the person's text: nothing left to decide.
      entry.conflict = null;
      entry.base = value;
      if (version !== undefined) entry.baseVersion = version;
    } else if (value !== entry.base) {
      entry.conflict.theirs = value;
      if (version !== undefined) entry.conflict.theirsVersion = version;
    }
    return;
  }
  const pending = entry.dirty || entry.status === "saving";
  if (!pending) {
    entry.value = value;
    entry.base = value;
    if (version !== undefined) entry.baseVersion = version;
    return;
  }
  if (value === entry.base) {
    if (version !== undefined && version !== null) entry.baseVersion = version;
    return;
  }
  if (value === entry.value || (entry.writing !== undefined && value === entry.writing)) {
    entry.base = value;
    if (version !== undefined) entry.baseVersion = version;
    return;
  }
  entry.conflict = { theirs: value, theirsVersion: version ?? null, ancestor: entry.base };
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
     * undo, new bytes for a new version). A clean copy follows it; a copy with
     * unsaved work keeps the person's text, and a move under it from someone
     * else is a CONFLICT (`applySource`). `draft` is unsaved text kept from
     * before a reload — it applies only when there is no copy yet; a draft made
     * on another stored version than the one loaded is a conflict too.
     */
    workingCopySourceLoaded(
      state,
      action: PayloadAction<{
        key: string;
        value: string;
        version?: number | null;
        draft?: string | null;
        /** The stored version the draft was typed on. */
        draftBaseVersion?: number | null;
        /** The text the draft was typed on (lets a conflict merge). */
        draftBase?: string | null;
      }>,
    ) {
      const { key, value, version, draft, draftBaseVersion, draftBase } = action.payload;
      const entry = entryFor(state, key);
      if (entry.value === undefined) {
        if (draft != null && draft !== value) {
          entry.value = draft;
          const movedSince =
            draftBaseVersion != null && version != null && draftBaseVersion !== version;
          if (movedSince) {
            entry.base = draftBase ?? value;
            entry.baseVersion = draftBaseVersion;
            entry.conflict = {
              theirs: value,
              theirsVersion: version,
              ancestor: draftBase ?? undefined,
            };
          } else {
            entry.base = value;
            if (version !== undefined) entry.baseVersion = version;
          }
        } else {
          entry.value = value;
          entry.base = value;
          if (version !== undefined) entry.baseVersion = version;
        }
      } else {
        applySource(entry, value, version);
      }
      recomputeDirty(entry);
      settleStatus(entry);
    },
    /** Engine records: the stored state moved under unsaved work (`theirsRef` names it). */
    workingCopyConflicted(
      state,
      action: PayloadAction<{ key: string; theirsVersion?: number | null; theirsRef?: string | null }>,
    ) {
      const entry = entryFor(state, action.payload.key);
      entry.conflict = {
        ...(entry.conflict ?? { theirsVersion: null }),
        theirsVersion: action.payload.theirsVersion ?? entry.conflict?.theirsVersion ?? null,
        theirsRef: action.payload.theirsRef ?? entry.conflict?.theirsRef ?? null,
      };
      settleStatus(entry);
    },
    /**
     * The person chose. `mine`: their text goes on top of the stored one (the
     * next save writes it). `theirs`: the stored one replaces their text.
     * `merge`: `merged` (both edits, from `mergeText`) goes on top.
     */
    workingCopyConflictResolved(
      state,
      action: PayloadAction<{ key: string; choice: "mine" | "theirs" | "merge"; merged?: string }>,
    ) {
      const entry = state.byKey[action.payload.key];
      const conflict = entry?.conflict;
      if (!entry || !conflict) return;
      const { choice, merged } = action.payload;
      if (entry.value !== undefined && conflict.theirs !== undefined) {
        if (choice === "theirs") entry.value = conflict.theirs;
        else if (choice === "merge" && merged !== undefined) entry.value = merged;
        entry.base = conflict.theirs;
      }
      // Theirs: nothing of the person's is pending any more.
      if (choice === "theirs") entry.savedSeq = entry.editSeq;
      if (conflict.theirsVersion !== null) entry.baseVersion = conflict.theirsVersion;
      entry.conflict = null;
      entry.failure = null;
      entry.saveError = null;
      recomputeDirty(entry);
      settleStatus(entry);
    },
    /** A local edit (text records). */
    workingCopyEdited(state, action: PayloadAction<{ key: string; value: string }>) {
      const entry = entryFor(state, action.payload.key);
      if (entry.value === action.payload.value) return;
      if (entry.base === undefined) entry.base = entry.value ?? "";
      entry.value = action.payload.value;
      entry.editSeq += 1;
      recomputeDirty(entry);
      settleStatus(entry);
    },
    /**
     * A local edit the text does not carry: an engine record's body (a Univer
     * document), or a text record's other fields (a note's title, folder).
     */
    workingCopyTouched(state, action: PayloadAction<{ key: string }>) {
      const entry = entryFor(state, action.payload.key);
      entry.editSeq += 1;
      entry.touchedSeq = entry.editSeq;
      recomputeDirty(entry);
      settleStatus(entry);
    },
    workingCopySaveStarted(state, action: PayloadAction<{ key: string; writing?: string }>) {
      const entry = entryFor(state, action.payload.key);
      entry.status = "saving";
      entry.savingSeq = entry.editSeq;
      entry.writing = action.payload.writing;
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
      entry.failure = null;
      entry.writing = undefined;
      recomputeDirty(entry);
      entry.status = entry.conflict
        ? "conflict"
        : entry.dirty
          ? "dirty"
          : action.payload.savedAt !== null
            ? "saved"
            : "idle";
    },
    /**
     * The save found the stored state moved under this edit (a compare-and-swap
     * refused it). The person decides; nothing is written meanwhile. Text
     * records carry the stored text (`theirs`); engine records a `ref`.
     */
    workingCopySaveConflicted(
      state,
      action: PayloadAction<{ key: string; theirs?: string; version?: number | null; ref?: string | null }>,
    ) {
      const entry = state.byKey[action.payload.key];
      if (!entry) return;
      const { theirs, version, ref } = action.payload;
      entry.savingSeq = null;
      entry.writing = undefined;
      entry.status = "idle";
      if (entry.value !== undefined && theirs !== undefined && theirs === entry.value) {
        // The stored text already IS the person's text: nothing to decide.
        entry.base = theirs;
        if (version !== undefined) entry.baseVersion = version;
      } else {
        entry.conflict = {
          theirs,
          theirsVersion: version ?? null,
          ancestor: entry.value !== undefined ? entry.base : undefined,
          theirsRef: ref ?? null,
        };
      }
      recomputeDirty(entry);
      settleStatus(entry);
    },
    workingCopySaveFailed(
      state,
      action: PayloadAction<{
        key: string;
        error: string;
        permanent?: boolean;
        attempts?: number;
        retryAt?: number | null;
      }>,
    ) {
      const entry = state.byKey[action.payload.key];
      if (!entry) return;
      entry.savingSeq = null;
      entry.writing = undefined;
      entry.status = "error";
      entry.saveError = action.payload.error;
      entry.failure = {
        permanent: action.payload.permanent ?? false,
        attempts: action.payload.attempts ?? (entry.failure?.attempts ?? 0) + 1,
        retryAt: action.payload.retryAt ?? null,
      };
      settleStatus(entry);
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
      // In a conflict, "back to what is stored" is the stored text now.
      if (entry.conflict?.theirs !== undefined) entry.base = entry.conflict.theirs;
      if (entry.conflict && entry.conflict.theirsVersion !== null) entry.baseVersion = entry.conflict.theirsVersion;
      if (entry.base !== undefined) entry.value = entry.base;
      entry.savedSeq = entry.editSeq;
      entry.saveError = null;
      entry.failure = null;
      entry.conflict = null;
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
      entry.failure = null;
      entry.conflict = null;
      recomputeDirty(entry);
      entry.status = "idle";
    },
    /** The record's metadata was read or written (a row, an edit gate). */
    workingCopyRecordLoaded(state, action: PayloadAction<{ key: string; record: unknown }>) {
      entryFor(state, action.payload.key).record = action.payload.record;
    },
    /** A view of the record's text is going away: keep where its caret / selection was. */
    workingCopySelectionKept(state, action: PayloadAction<{ key: string } & KeptTextSelection>) {
      const { key, ...selection } = action.payload;
      state.selections ??= {};
      state.selections[key] = selection;
    },
    /** A rich editor of the record is going away: keep its caret / selection. */
    workingCopyRichCaretKept(state, action: PayloadAction<{ key: string; caret: KeptRichCaret }>) {
      state.richCarets ??= {};
      state.richCarets[action.payload.key] = action.payload.caret;
    },
    /** No view, nothing pending: the record's own store is the truth again. */
    workingCopyReleased(state, action: PayloadAction<{ key: string }>) {
      const entry = state.byKey[action.payload.key];
      if (entry && entry.views === 0 && !entry.dirty && !entry.conflict && entry.status !== "saving") {
        delete state.byKey[action.payload.key];
      }
    },
  },
});

export const {
  workingCopyViewAttached,
  workingCopyViewDetached,
  workingCopySourceLoaded,
  workingCopyConflicted,
  workingCopyConflictResolved,
  workingCopyEdited,
  workingCopyTouched,
  workingCopySaveStarted,
  workingCopySaved,
  workingCopySaveConflicted,
  workingCopySaveFailed,
  workingCopySettled,
  workingCopyDiscarded,
  workingCopyReset,
  workingCopyRecordLoaded,
  workingCopySelectionKept,
  workingCopyRichCaretKept,
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

/** The record's metadata as last read (see `WorkingCopyEntry.record`). */
export const selectWorkingCopyRecord = createSelector(
  [selectWorkingCopy],
  (entry): unknown => entry?.record,
);

/** The record's open conflict, or null. */
export const selectWorkingCopyConflict = createSelector(
  [selectWorkingCopy],
  (entry): WorkingCopyConflict | null => entry?.conflict ?? null,
);

export const selectWorkingCopyStatus = createSelector(
  [selectWorkingCopy],
  (entry): WorkingCopyStatus | undefined => entry?.status,
);

/** Where the caret / selection was in the record's text when a view of it last went away. */
export function getKeptTextSelection(state: WithWorkingCopies, key: string): KeptTextSelection | undefined {
  return state.workingCopies?.selections?.[key];
}

/** The rich editor's caret / selection when a view of the record last went away. */
export function getKeptRichCaret(state: WithWorkingCopies, key: string): KeptRichCaret | undefined {
  return state.workingCopies?.richCarets?.[key];
}
