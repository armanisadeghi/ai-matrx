// features/notes/redux/selectors.ts
// Memoized selectors for the notes Redux slice.
//
// CRITICAL: Curried selectors (per-note, per-instance) use a Map cache
// so the same ID always returns the same selector instance. Without this,
// useAppSelector would create a new selector on every render → infinite loop.

import { createSelector } from "@reduxjs/toolkit";
import { idMatchesQuery } from "@/utils/search-scoring";
import type { RootState } from "@/lib/redux/store";
import type {
  NoteRecord,
  NoteFetchStatus,
  NotesInstance,
  NotesSliceState,
  FindReplaceState,
} from "./notes.types";

// ── Selector cache to prevent re-creation on every render ───────────────────

const selectorCache = new Map<string, any>();

function cached<T>(key: string, factory: () => T): T {
  if (!selectorCache.has(key)) {
    selectorCache.set(key, factory());
  }
  return selectorCache.get(key) as T;
}

// ── Default folder ordering ─────────────────────────────────────────────────

const DEFAULT_FOLDER_ORDER: readonly string[] = [
  "Draft",
  "Personal",
  "Business",
  "Prompts",
  "Scratch",
];

const EMPTY_NOTE_TAGS: string[] = [];

// ═══════════════════════════════════════════════════════════════════════════════
// 1. BASE SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

export const selectNotesState = (state: RootState): NotesSliceState =>
  state.notes;

export const selectNotesMap = createSelector(
  [selectNotesState],
  (slice) => slice.notes,
);

const selectInstancesMap = createSelector(
  [selectNotesState],
  (slice) => slice.instances,
);

// ═══════════════════════════════════════════════════════════════════════════════
// 2. GLOBAL LIST SELECTORS (non-curried — safe for direct use)
// ═══════════════════════════════════════════════════════════════════════════════

export const selectAllNotesList = createSelector(
  [selectNotesMap],
  (notes): NoteRecord[] =>
    Object.values(notes)
      .filter((n) => !n.deleted_at)
      .sort((a, b) => {
        const aPos = a.position ?? 0;
        const bPos = b.position ?? 0;
        if (aPos !== bPos) return aPos - bPos;
        return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      }),
);

export const selectAllFolders = createSelector(
  [selectAllNotesList],
  (notes): string[] => {
    const folderSet = new Set<string>(DEFAULT_FOLDER_ORDER);
    for (const note of notes) {
      if (note.folder_name) folderSet.add(note.folder_name);
    }
    return Array.from(folderSet).sort((a, b) => {
      const aIdx = DEFAULT_FOLDER_ORDER.indexOf(a);
      const bIdx = DEFAULT_FOLDER_ORDER.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });
  },
);

export const selectDeletedNotesList = createSelector(
  [selectNotesMap],
  (notes): NoteRecord[] => Object.values(notes).filter((n) => !!n.deleted_at),
);

export const selectNotesListStatus = createSelector(
  [selectNotesState],
  (slice) => slice.listStatus,
);

export const selectRealtimeConnected = createSelector(
  [selectNotesState],
  (slice) => slice.realtimeConnected,
);

export const selectSavingNoteIds = createSelector(
  [selectNotesState],
  (slice) => slice._pendingDispatchIds,
);

// ── Derived global selectors ────────────────────────────────────────────────

export const selectActiveNoteId = createSelector(
  [selectNotesState],
  (slice): string | null => {
    const instances = Object.values(slice.instances);
    return instances.length > 0 ? (instances[0].activeTabId ?? null) : null;
  },
);

export const selectActiveNote = createSelector(
  [selectNotesMap, selectActiveNoteId],
  (notes, activeId): NoteRecord | undefined =>
    activeId ? notes[activeId] : undefined,
);

export const selectOpenTabs = createSelector(
  [selectNotesState],
  (slice): string[] => {
    const instances = Object.values(slice.instances);
    return instances.length > 0 ? instances[0].openTabs : [];
  },
);

export const selectOpenTabNotes = createSelector(
  [selectNotesMap, selectOpenTabs],
  (notes, tabIds): NoteRecord[] =>
    tabIds
      .map((id) => notes[id])
      .filter((r): r is NoteRecord => r !== undefined),
);

// ── Presence ────────────────────────────────────────────────────────────────

export const selectOtherUsersActive = createSelector(
  [selectNotesState],
  (slice): boolean => slice.otherUsersActive,
);

export const selectActiveNoteEditedByOthers = createSelector(
  [selectNotesState],
  (slice): boolean => slice.activeNoteEditedByOthers,
);

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PER-NOTE SELECTORS (curried + cached — SAFE for useAppSelector)
//
// Each returns a STABLE selector instance for a given noteId.
// Call pattern: useAppSelector(selectNoteContent(noteId))
// ═══════════════════════════════════════════════════════════════════════════════

export const selectNoteById = (noteId: string) =>
  cached(`noteById:${noteId}`, () =>
    createSelector(
      selectNotesMap,
      (notes): NoteRecord | undefined => notes[noteId],
    ),
  );

export const selectNoteContent = (noteId: string) =>
  cached(`noteContent:${noteId}`, () =>
    createSelector(
      selectNotesMap,
      (notes): string | undefined => notes[noteId]?.content ?? undefined,
    ),
  );

export const selectNoteLabel = (noteId: string) =>
  cached(`noteLabel:${noteId}`, () =>
    createSelector(
      selectNotesMap,
      (notes): string | undefined => notes[noteId]?.label,
    ),
  );

export const selectNoteFolder = (noteId: string) =>
  cached(`noteFolder:${noteId}`, () =>
    createSelector(
      selectNotesMap,
      (notes): string | undefined => notes[noteId]?.folder_name ?? undefined,
    ),
  );

export const selectNoteTags = (noteId: string) =>
  cached(`noteTags:${noteId}`, () =>
    createSelector(
      selectNotesMap,
      (notes): string[] => notes[noteId]?.tags ?? EMPTY_NOTE_TAGS,
    ),
  );

export const selectNoteEditorMode = (noteId: string) =>
  cached(`noteMode:${noteId}`, () =>
    createSelector(
      selectNotesMap,
      (notes): string | undefined =>
        (notes[noteId]?.metadata as Record<string, unknown>)?.lastEditorMode as
          | string
          | undefined,
    ),
  );

export const selectNoteIsAutogenerated = (noteId: string) =>
  cached(`noteAutogen:${noteId}`, () =>
    createSelector(
      selectNotesMap,
      (notes): boolean => notes[noteId]?._isAutogenerated ?? false,
    ),
  );

// ── Per-note primitive selectors (boolean/number — no reference issues) ─────

export const selectNoteIsDirtyById =
  (noteId: string): ((state: RootState) => boolean) =>
  (state) =>
    state.notes?.notes?.[noteId]?._dirty ?? false;

export const selectNoteIsSavingById =
  (noteId: string): ((state: RootState) => boolean) =>
  (state) =>
    state.notes?.notes?.[noteId]?._saving ?? false;

export const selectNoteIsDirty = selectNoteIsDirtyById;

export const selectNoteSaveState =
  (
    noteId: string,
  ): ((state: RootState) => "saved" | "dirty" | "saving" | "conflict") =>
  (state) => {
    const record = state.notes?.notes?.[noteId];
    if (!record) return "saved";
    if (record._error === "conflict") return "conflict";
    if (record._saving) return "saving";
    if (record._dirty) return "dirty";
    return "saved";
  };

export const selectNoteIsLoading =
  (noteId: string): ((state: RootState) => boolean) =>
  (state) =>
    state.notes?.notes?.[noteId]?._loading ?? false;

export const selectNoteFetchStatus =
  (noteId: string): ((state: RootState) => NoteFetchStatus | null) =>
  (state) =>
    state.notes?.notes?.[noteId]?._fetchStatus ?? null;

export const selectNoteCanUndo =
  (noteId: string): ((state: RootState) => boolean) =>
  (state) =>
    (state.notes?.notes?.[noteId]?._undoPast?.length ?? 0) > 0;

export const selectNoteCanRedo =
  (noteId: string): ((state: RootState) => boolean) =>
  (state) =>
    (state.notes?.notes?.[noteId]?._undoFuture?.length ?? 0) > 0;

export const selectNoteUndoDepth =
  (noteId: string): ((state: RootState) => number) =>
  (state) =>
    state.notes?.notes?.[noteId]?._undoPast?.length ?? 0;

export const selectNoteRedoDepth =
  (noteId: string): ((state: RootState) => number) =>
  (state) =>
    state.notes?.notes?.[noteId]?._undoFuture?.length ?? 0;

export const selectNoteDirtyFields =
  (noteId: string): ((state: RootState) => Set<string>) =>
  (state) =>
    state.notes?.notes?.[noteId]?._dirtyFields ?? new Set();

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PER-INSTANCE SELECTORS (curried + cached)
// ═══════════════════════════════════════════════════════════════════════════════

export const selectInstance = (instanceId: string) =>
  cached(`inst:${instanceId}`, () =>
    createSelector(
      selectInstancesMap,
      (instances): NotesInstance | undefined => instances[instanceId],
    ),
  );

export const selectInstanceTabs = (instanceId: string) =>
  cached(`instTabs:${instanceId}`, () =>
    createSelector(
      selectInstancesMap,
      (instances): string[] | undefined => instances[instanceId]?.openTabs,
    ),
  );

export const selectInstanceActiveTab = (instanceId: string) =>
  cached(`instActive:${instanceId}`, () =>
    createSelector(
      selectInstancesMap,
      (instances): string | null | undefined =>
        instances[instanceId]?.activeTabId,
    ),
  );

export const selectFindReplaceState = (instanceId: string) =>
  cached(`instFR:${instanceId}`, () =>
    createSelector(
      selectInstancesMap,
      (instances): FindReplaceState | null =>
        instances[instanceId]?.findReplace ?? null,
    ),
  );

export const selectInstanceSplitNoteId = (instanceId: string) =>
  cached(`instSplit:${instanceId}`, () =>
    createSelector(
      selectInstancesMap,
      (instances): string | null => instances[instanceId]?.splitNoteId ?? null,
    ),
  );

export const selectInstanceHistoryOpen = (instanceId: string) =>
  cached(`instHistory:${instanceId}`, () =>
    createSelector(
      selectInstancesMap,
      (instances): boolean => instances[instanceId]?.historyOpen ?? false,
    ),
  );

export const selectInstanceTabInteractionAt = (instanceId: string) =>
  cached(`instTabInteractionAt:${instanceId}`, () =>
    createSelector(
      selectInstancesMap,
      (instances): number | null =>
        instances[instanceId]?.tabInteractionAt ?? null,
    ),
  );

export const selectIsActiveTab =
  (instanceId: string, noteId: string): ((state: RootState) => boolean) =>
  (state) =>
    state.notes?.instances?.[instanceId]?.activeTabId === noteId;

export const selectIsInstanceActiveTab = selectIsActiveTab;

export const selectIsPendingDispatch =
  (noteId: string): ((state: RootState) => boolean) =>
  (state) =>
    state.notes?._pendingDispatchIds?.has?.(noteId) ?? false;

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SPECIALIZED SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

export const selectPendingDispatchIds = createSelector(
  [selectNotesState],
  (slice) => slice._pendingDispatchIds,
);

export const selectNotesByFolder = (folder: string) =>
  cached(`notesByFolder:${folder}`, () =>
    createSelector(selectAllNotesList, (notes): NoteRecord[] =>
      notes.filter((n) => n.folder_name === folder),
    ),
  );

export const selectFilteredNotes = (
  search?: string,
  folder?: string,
  tags?: string[],
) => {
  const key = `filtered:${search ?? ""}:${folder ?? ""}:${(tags ?? []).join(",")}`;
  return cached(key, () =>
    createSelector(selectAllNotesList, (notes): NoteRecord[] => {
      let result = notes;
      if (folder) result = result.filter((n) => n.folder_name === folder);
      if (tags && tags.length > 0)
        result = result.filter((n) =>
          tags.every((t) => (n.tags ?? EMPTY_NOTE_TAGS).includes(t)),
        );
      if (search) {
        const q = search.toLowerCase();
        result = result.filter(
          (n) =>
            n.label.toLowerCase().includes(q) ||
            (n.content ?? "").toLowerCase().includes(q) ||
            (n.tags ?? EMPTY_NOTE_TAGS).some((t) =>
              t.toLowerCase().includes(q),
            ) ||
            idMatchesQuery(n, q),
        );
      }
      return result;
    }),
  );
};

export const selectAutogeneratedEmptyNote = (folder: string) =>
  cached(`autogen:${folder}`, () =>
    createSelector(selectNotesMap, (notes): string | null => {
      for (const [id, record] of Object.entries(notes)) {
        if (
          record._isAutogenerated &&
          !(record.content ?? "").trim() &&
          record.folder_name === folder
        ) {
          return id;
        }
      }
      return null;
    }),
  );

// ── Scope assignment selectors ───────────────────────────────────────────────

export const selectNoteScopeAssignments = createSelector(
  [selectNotesState],
  (slice) => slice.noteScopeAssignments,
);

export const selectNoteScopesLoaded = createSelector(
  [selectNotesState],
  (slice) => slice.noteScopesLoaded,
);

/**
 * Group notes by scope. Returns a Map of "ScopeType: ScopeName" → NoteRecord[].
 * A note can appear in multiple groups (many-to-many).
 */
export const selectNotesGroupedByScope = createSelector(
  [selectAllNotesList, selectNoteScopeAssignments],
  (notes, assignments) => {
    const map = new Map<string, NoteRecord[]>();
    const noteMap = new Map(notes.map((n) => [n.id, n]));

    for (const a of assignments) {
      const note = noteMap.get(a.entity_id);
      if (!note) continue;
      const key = `${a.scope_type}: ${a.scope_name}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(note);
    }

    // Add "Unassigned" group for notes with no scope assignments
    const assignedIds = new Set(assignments.map((a) => a.entity_id));
    const unassigned = notes.filter((n) => !assignedIds.has(n.id));
    if (unassigned.length > 0) {
      map.set("Unassigned", unassigned);
    }

    return map;
  },
);

// ── Grouping selectors for sidebar modes ────────────────────────────────────

/** Group notes by a given key, returning a Map of group label → notes */
export const selectNotesGroupedBy = createSelector(
  [selectAllNotesList],
  (notes) => ({
    byFolder: () => {
      const map = new Map<string, NoteRecord[]>();
      for (const n of notes) {
        const key = n.folder_name || "Draft";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(n);
      }
      return map;
    },
    byOrganization: () => {
      const map = new Map<string, NoteRecord[]>();
      for (const n of notes) {
        const key = n.organization_id || "__none__";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(n);
      }
      return map;
    },
    byProject: () => {
      const map = new Map<string, NoteRecord[]>();
      for (const n of notes) {
        const key = n.project_id || "__none__";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(n);
      }
      return map;
    },
    byTask: () => {
      const map = new Map<string, NoteRecord[]>();
      for (const n of notes) {
        const key = n.task_id || "__none__";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(n);
      }
      return map;
    },
  }),
);
