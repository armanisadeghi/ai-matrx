// features/notes/redux/selectors.ts
// Memoized selectors for the notes Redux slice.
//
// CRITICAL: Curried selectors (per-note, per-instance) use a Map cache
// so the same ID always returns the same selector instance. Without this,
// useAppSelector would create a new selector on every render → infinite loop.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  NoteRecord,
  NoteFetchStatus,
  NotesInstance,
  NotesSliceState,
  FindReplaceState,
} from "./notes.types";
import { DEFAULT_FOLDER_NAMES } from "../constants/defaultFolders";
import { noteFolderIdentityKey, type FolderReference } from "../types";

// ── Selector cache to prevent re-creation on every render ───────────────────

const selectorCache = new Map<string, any>();

function cached<T>(key: string, factory: () => T): T {
  if (!selectorCache.has(key)) {
    selectorCache.set(key, factory());
  }
  return selectorCache.get(key) as T;
}

// ── Default folder ordering (single source: `constants/defaultFolders.ts`) ──

const DEFAULT_FOLDER_ORDER: readonly string[] = DEFAULT_FOLDER_NAMES;

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

// ── The list PROJECTION: ordering and folders that content edits never touch ─
//
// `updateNoteContent` rewrites one record every 200–1000 ms while the user
// types. Before 2026-09-14 that re-ran a full filter + sort of every note plus
// a folder-set and folder-reference rebuild, three times, per keystroke burst
// (audit N-23). The sort order and the folder sets do not depend on a note's
// BODY at all, so they are keyed off a per-note STRUCTURAL signature instead:
// a content edit leaves every signature identical, the projection returns the
// previous object, and `selectAllFolders` / `selectFolderReferences` hand back
// the very same array they returned last time — no sort, no Set, no rebuild,
// and no re-render in any of their consumers.
//
// `selectAllNotesList` itself still returns FRESH records (a cheap O(N) map
// over the cached order). It must: `useGlobalFind`, the sidebar's empty-note
// reuse and the bulk markdown export all read `.content` off these rows, and
// handing them the pre-edit objects would have made find, reuse and export
// silently stale. What that selector no longer does is sort.

const NOTE_STRUCTURE_SIGNATURE = new WeakMap<NoteRecord, string>();

/** Everything the ordering and the folder sets are derived from — never the
 *  body. Cached on the record's object identity, so an unrelated note costs a
 *  WeakMap hit and an edited one costs one string join. */
function structureSignature(note: NoteRecord): string {
  const hit = NOTE_STRUCTURE_SIGNATURE.get(note);
  if (hit !== undefined) return hit;
  const signature = [
    note.id,
    note.position ?? "",
    note.updated_at ?? "",
    note.label ?? "",
    note.folder_name ?? "",
    note.folder_id ?? "",
    note.organization_id ?? "",
    note.deleted_at ?? "",
    note._sharedWithMe ? "1" : "0",
  ].join("\u0000");
  NOTE_STRUCTURE_SIGNATURE.set(note, signature);
  return signature;
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sameFolderReferences(a: readonly FolderReference[], b: readonly FolderReference[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].organizationId !== b[i].organizationId || a[i].name !== b[i].name) return false;
  }
  return true;
}

export interface NotesListProjection {
  /** Owner-visible note ids in sidebar order. */
  readonly orderedIds: readonly string[];
  /** Display-only folder names, default folders first. */
  readonly folders: string[];
  /** Folder identity for mutations. */
  readonly folderReferences: FolderReference[];
}

let listProjectionCache:
  | { signatures: Map<string, string>; value: NotesListProjection }
  | null = null;

export const selectNotesListProjection = createSelector(
  [selectNotesMap],
  (notes): NotesListProjection => {
    const signatures = new Map<string, string>();
    const visible: NoteRecord[] = [];
    for (const note of Object.values(notes) as NoteRecord[]) {
      // Shared-with-me notes live ONLY in the sidebar's "Shared with me"
      // section — never in the owner's folders/recents groupings.
      if (!note || note.deleted_at || note._sharedWithMe) continue;
      signatures.set(note.id, structureSignature(note));
      visible.push(note);
    }

    if (listProjectionCache && listProjectionCache.signatures.size === signatures.size) {
      let unchanged = true;
      for (const [id, signature] of signatures) {
        if (listProjectionCache.signatures.get(id) !== signature) {
          unchanged = false;
          break;
        }
      }
      // Nothing structural moved — the body changed. Same projection object.
      if (unchanged) return listProjectionCache.value;
    }

    visible.sort((a, b) => {
      const aPos = a.position ?? 0;
      const bPos = b.position ?? 0;
      if (aPos !== bPos) return aPos - bPos;
      return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
    });

    const folderSet = new Set<string>(DEFAULT_FOLDER_ORDER);
    const folderReferences = new Map<string, FolderReference>();
    for (const note of visible) {
      if (note.folder_name) folderSet.add(note.folder_name);
      if (!note.folder_id || !note.organization_id) continue;
      const folder = {
        id: note.folder_id,
        organizationId: note.organization_id,
        name: note.folder_name ?? "Uncategorized",
      };
      folderReferences.set(`${folder.organizationId}:${folder.id}`, folder);
    }

    const previous = listProjectionCache?.value;
    const orderedIds = visible.map((note) => note.id);
    const nextFolderReferences = Array.from(folderReferences.values());
    const value: NotesListProjection = {
      orderedIds: previous && sameStrings(previous.orderedIds, orderedIds) ? previous.orderedIds : orderedIds,
      folders: Array.from(folderSet).sort((a, b) => {
        const aIdx = DEFAULT_FOLDER_ORDER.indexOf(a);
        const bIdx = DEFAULT_FOLDER_ORDER.indexOf(b);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return a.localeCompare(b);
      }),
      folderReferences:
        previous && sameFolderReferences(previous.folderReferences, nextFolderReferences)
          ? previous.folderReferences
          : nextFolderReferences,
    };
    // A save moves `updated_at` (a structural field), which rebuilds the
    // projection — but the folder lists almost never change. Hand back the
    // previous arrays when their contents match: every sidebar row receives
    // `folderReferences`, and a fresh-but-equal array re-rendered every row on
    // every save (the Write-mode typing freeze, 2026-10-10).
    if (previous && sameStrings(previous.folders, value.folders)) {
      (value as { folders: string[] }).folders = previous.folders;
    }
    listProjectionCache = { signatures, value };
    return value;
  },
);

export const selectAllNotesList = createSelector(
  [selectNotesListProjection, selectNotesMap],
  (projection, notes): NoteRecord[] => {
    const rows: NoteRecord[] = [];
    for (const id of projection.orderedIds) {
      const note = notes[id];
      if (note) rows.push(note as NoteRecord);
    }
    return rows;
  },
);

// ── The sidebar's list: stable while the person types ─────────────────────
// Every save of the open note replaces its record (content, version, dirty
// flags, updated_at), and a fresh list re-rendered the WHOLE sidebar — every
// folder header and group, O(notes) per save (the Write-mode freeze sweep,
// 2026-10-10). The list keeps the previous array while nothing the LIST is
// built from moved; each row reads its own live record (NoteSidebarRow), so
// labels, times and menu content are never stale on screen.

/** What the list's grouping, order and filters read off a record (never the body). */
const SIDEBAR_LIST_FIELDS = [
  // NOT the label: a new note's auto-label moves while its first line is
  // typed; rows show the live label, and name order reads the live list.
  "id", "folder_name", "folder_id", "organization_id", "position",
  "deleted_at", "_sharedWithMe", "_sharedMeta", "_isAutogenerated", "created_by", "tags",
] as const;

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // A save's server echo rebuilds arrays/objects (tags, share meta) with equal contents.
  if (a && b && typeof a === "object" && typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

function sameListFields(a: NoteRecord, b: NoteRecord): boolean {
  for (const field of SIDEBAR_LIST_FIELDS) {
    if (!sameValue((a as unknown as Record<string, unknown>)[field], (b as unknown as Record<string, unknown>)[field])) return false;
  }
  return true;
}

/**
 * `previous` when `next` holds the same notes in the same order with the same
 * list fields, and every moved `updated_at` belongs to the note that was
 * already the newest (so no "Modified" or "Recent" order can change).
 */
function stableNoteList(previous: NoteRecord[] | null, next: NoteRecord[]): NoteRecord[] {
  if (!previous || previous.length !== next.length) return next;
  let newest = "";
  for (const note of previous) if ((note.updated_at ?? "") > newest) newest = note.updated_at ?? "";
  for (let i = 0; i < next.length; i++) {
    const a = previous[i];
    const b = next[i];
    if (a === b) continue;
    if (a.id !== b.id || !sameListFields(a, b)) return next;
    if (a.updated_at !== b.updated_at && !((a.updated_at ?? "") === newest && (b.updated_at ?? "") >= newest)) return next;
  }
  return previous;
}

let sidebarListCache: NoteRecord[] | null = null;
let deletedListCache: NoteRecord[] | null = null;
let sharedListCache: NoteRecord[] | null = null;

/** The owner's notes in sidebar order — the SAME array across saves of a body. */
export const selectSidebarNotesList = createSelector(
  [selectAllNotesList],
  (live): NoteRecord[] => {
    sidebarListCache = stableNoteList(sidebarListCache, live);
    return sidebarListCache;
  },
  // Handing back its input (or the previous array) IS the point here.
  { devModeChecks: { identityFunctionCheck: "never" } },
);

export const selectAllFolders = createSelector(
  [selectNotesListProjection],
  (projection): string[] => projection.folders,
);

/** Folder identity for mutations. `selectAllFolders` remains display-only. */
export const selectFolderReferences = createSelector(
  [selectNotesListProjection],
  (projection): FolderReference[] => projection.folderReferences,
);

export const selectDeletedNotesList = createSelector(
  [selectNotesMap],
  (notes): NoteRecord[] => {
    deletedListCache = stableNoteList(deletedListCache, Object.values(notes).filter((n) => !!n.deleted_at));
    return deletedListCache;
  },
);

/** Notes shared WITH the current user (from `get_notes_shared_with_me`),
 *  most recently updated first. */
export const selectSharedWithMeNotes = createSelector(
  [selectNotesMap],
  (notes): NoteRecord[] => {
    sharedListCache = stableNoteList(
      sharedListCache,
      Object.values(notes)
        .filter((n) => n._sharedWithMe && !n.deleted_at)
        .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "")),
    );
    return sharedListCache;
  },
);

export const selectNotesSharedStatus = (state: RootState) => state.notes.sharedStatus;

/** Why the "Shared with me" read failed, or null — its count says "—" then, never 0. */
export const selectNotesSharedError = (state: RootState): string | null =>
  state.notes.sharedError ?? null;

/** The Trash read's outcome — gate "Trash is empty" on "loaded". */
export const selectNotesTrashStatus = createSelector(
  [selectNotesState],
  (slice) => slice.trashStatus ?? "idle",
);

export const selectNotesTrashError = createSelector(
  [selectNotesState],
  (slice) => slice.trashError ?? null,
);

export const selectNotesListStatus = createSelector(
  [selectNotesState],
  (slice) => slice.listStatus,
);

export const selectNotesListError = createSelector(
  [selectNotesState],
  (slice) => slice.listError,
);

export const selectRealtimeConnected = createSelector(
  [selectNotesState],
  (slice) => slice.realtimeConnected,
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

// ── Presence (realtime `updated_by` attribution) ─────────────────────────────

const selectNoteEditorsMap = createSelector(
  [selectNotesState],
  (slice) => slice.noteEditors,
);

/** Latest non-self editor of a note (from realtime `updated_by`), or
 *  undefined. Entries are timer-cleared by the realtime middleware. */
export const selectNoteEditor = (noteId: string) =>
  cached(`noteEditor:${noteId}`, () =>
    createSelector(selectNoteEditorsMap, (editors) => editors[noteId]),
  );

/** True when any note currently has a live non-self editor. */
export const selectAnyNoteEditorActive = createSelector(
  [selectNoteEditorsMap],
  (editors): boolean => Object.keys(editors).length > 0,
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

export const selectNoteContentLoadStatus = (noteId: string) =>
  cached(`noteContentLoadStatus:${noteId}`, () =>
    createSelector(
      selectNotesState,
      (slice): "idle" | "loading" | "loaded" | "error" =>
        slice.contentLoadStatus[noteId] ?? "idle",
    ),
  );

export const selectNoteContent = (noteId: string) =>
  cached(`noteContent:${noteId}`, () =>
    createSelector(
      selectNotesMap,
      (notes): string | undefined => notes[noteId]?.content ?? undefined,
    ),
  );

/**
 * Consecutive failed saves for one note (0 when the last save landed).
 * Drives the blocking save-failure banner at
 * `NOTE_SAVE_FAILURE_BLOCK_THRESHOLD`.
 */
export const selectNoteSaveFailureCount = (noteId: string) =>
  cached(`noteSaveFailureCount:${noteId}`, () =>
    createSelector(
      selectNotesMap,
      (notes): number => notes[noteId]?._consecutiveSaveFailures ?? 0,
    ),
  );

/** Epoch ms of the first failure in the current streak (null when clean). */
export const selectNoteFirstSaveFailureAt = (noteId: string) =>
  cached(`noteFirstSaveFailureAt:${noteId}`, () =>
    createSelector(
      selectNotesMap,
      (notes): number | null => notes[noteId]?._firstSaveFailureAt ?? null,
    ),
  );

/** The last save error message for a note (null when clean / on conflict). */
export const selectNoteSaveErrorMessage = (noteId: string) =>
  cached(`noteSaveErrorMessage:${noteId}`, () =>
    createSelector(selectNotesMap, (notes): string | null => {
      const error = notes[noteId]?._error ?? null;
      return error === "conflict" ? null : error;
    }),
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
      (notes): string | undefined => notes[noteId]?._editorMode ?? undefined,
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

const NO_PINNED: string[] = [];
export const selectInstancePinnedTabs = (instanceId: string) =>
  cached(`instPinned:${instanceId}`, () =>
    createSelector(
      selectInstancesMap,
      (instances): string[] => instances[instanceId]?.pinnedTabs ?? NO_PINNED,
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


export const selectInstanceOutlineOpen = (instanceId: string) =>
  cached(`instOutline:${instanceId}`, () =>
    createSelector(
      selectInstancesMap,
      (instances): boolean => instances[instanceId]?.outlineOpen ?? false,
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

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SPECIALIZED SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

export const selectNotesByFolder = (folder: string) =>
  cached(`notesByFolder:${folder}`, () =>
    createSelector(selectAllNotesList, (notes): NoteRecord[] =>
      notes.filter((n) => n.folder_name === folder),
    ),
  );

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
  [selectSidebarNotesList, selectNoteScopeAssignments],
  (notes, assignments) => {
    const map = new Map<string, NoteRecord[]>();
    const noteMap = new Map(notes.map((n) => [n.id, n]));

    for (const a of assignments) {
      const note = noteMap.get(a.entity_id);
      if (!note) continue;
      const key = `${a.scope_type}: ${a.scope_name}`;
      let bucket = map.get(key);
      if (!bucket) {
        bucket = [];
        map.set(key, bucket);
      }
      bucket.push(note);
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
        const key = noteFolderIdentityKey(n);
        let bucket = map.get(key);
        if (!bucket) {
          bucket = [];
          map.set(key, bucket);
        }
        bucket.push(n);
      }
      return map;
    },
    byProject: () => {
      const map = new Map<string, NoteRecord[]>();
      for (const n of notes) {
        const key = n.project_id || "__none__";
        let bucket = map.get(key);
        if (!bucket) {
          bucket = [];
          map.set(key, bucket);
        }
        bucket.push(n);
      }
      return map;
    },
    byTask: () => {
      const map = new Map<string, NoteRecord[]>();
      for (const n of notes) {
        const key = n.task_id || "__none__";
        let bucket = map.get(key);
        if (!bucket) {
          bucket = [];
          map.set(key, bucket);
        }
        bucket.push(n);
      }
      return map;
    },
  }),
);
