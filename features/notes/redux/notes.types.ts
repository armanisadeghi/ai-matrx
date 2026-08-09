// features/notes/redux/notes.types.ts
// Types for the notes Redux slice — 6-layer architecture.
// Every component consumes Redux directly. Zero prop drilling.

import type { Note } from "../types";

// ── Undoable fields ─────────────────────────────────────────────────────────

export type NoteUndoableField =
  | "content"
  | "label"
  | "folder_name"
  | "folder_id"
  | "tags"
  | "organization_id"
  | "project_id"
  | "task_id"
  | "visibility";

export const NOTE_UNDOABLE_FIELDS: readonly NoteUndoableField[] = [
  "content",
  "label",
  "folder_name",
  "folder_id",
  "tags",
  "organization_id",
  "project_id",
  "task_id",
  "visibility",
];

// ── Undo entry ──────────────────────────────────────────────────────────────

export interface NoteUndoEntry {
  field: NoteUndoableField;
  value: Note[NoteUndoableField];
  timestamp: number;
  byteEstimate: number;
}

export const NOTE_UNDO_MAX_ENTRIES = 50;
export const NOTE_UNDO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB soft cap per note
export const NOTE_UNDO_COALESCE_MS = 600;

// ── Fetch status ────────────────────────────────────────────────────────────

export type NoteFetchStatus = "list" | "full";

const FETCH_STATUS_RANK: Record<NoteFetchStatus, number> = {
  list: 1,
  full: 2,
};

export function shouldUpgradeNoteFetchStatus(
  current: NoteFetchStatus | null,
  incoming: NoteFetchStatus,
): boolean {
  if (!current) return true;
  return FETCH_STATUS_RANK[incoming] > FETCH_STATUS_RANK[current];
}

// ── Field snapshot (clean baselines for dirty tracking) ─────────────────────

export type NoteFieldSnapshot = Partial<
  Record<NoteUndoableField, Note[NoteUndoableField]>
>;

// ── Find & Replace state ────────────────────────────────────────────────────

/**
 * Search scope for find-and-replace.
 * - "file"   : current active note only (default — Ctrl+F)
 * - "global" : every note the user can see (Ctrl+Shift+F)
 */
export type FindScope = "file" | "global";

export interface FindReplaceState {
  isOpen: boolean;
  query: string;
  replaceText: string;
  caseSensitive: boolean;
  useRegex: boolean;
  wholeWord: boolean;
  showReplace: boolean;
  /**
   * Reveals the advanced/global section in the bar (include/exclude filters
   * and the global results panel). When false the bar behaves as a simple
   * per-file find. Independent of `scope` so the user can collapse the
   * advanced UI while keeping global mode active.
   */
  showAdvanced: boolean;
  scope: FindScope;
  /**
   * Comma-separated patterns matched against `<folder>/<label>` for each
   * note. Supports `*` as a wildcard. Empty string = match everything.
   * Mirrors VS Code's "files to include" field.
   */
  includePaths: string;
  /** Same syntax as `includePaths`. Empty string = exclude nothing. */
  excludePaths: string;
  matchCount: number;
  currentMatchIndex: number; // 0-based, -1 = no match
  /**
   * Monotonic counter incremented every time the bar should re-focus and
   * select-all the find input (e.g. user re-presses Ctrl+F while the bar
   * is already open). The bar watches this id and, on change, calls
   * focus() + select() on the find input so the next keystroke replaces
   * the existing query — matching VS Code / Chrome / Google Docs behavior.
   */
  focusRequestId: number;
  /**
   * When the user clicks a global search result for a note that isn't the
   * currently-active one, we open that note and stash the desired match
   * index here. The match list for that note is computed asynchronously
   * (after the editor re-renders), so we cannot just `setCurrentMatchIndex`
   * synchronously — it would get clamped by stale `matchCount`. Instead,
   * the file-scoped match-results reducer consumes this pending index the
   * moment the matches for the target note are produced.
   */
  pendingActiveNoteId: string | null;
  pendingActiveMatchIndex: number | null;
}

export const FIND_REPLACE_DEFAULTS: FindReplaceState = {
  isOpen: true,
  query: "",
  replaceText: "",
  caseSensitive: false,
  useRegex: false,
  wholeWord: false,
  showReplace: false,
  showAdvanced: false,
  scope: "file",
  includePaths: "",
  excludePaths: "",
  matchCount: 0,
  currentMatchIndex: -1,
  focusRequestId: 0,
  pendingActiveNoteId: null,
  pendingActiveMatchIndex: null,
};

// ── Notes Instance (Layer 6 — multi-instance support) ───────────────────────

export interface NotesInstance {
  /** Unique instance UUID (generated on register) */
  id: string;
  /** Note IDs open as tabs in THIS instance (order = tab order) */
  openTabs: string[];
  /** Active note ID within THIS instance */
  activeTabId: string | null;
  /** Find & Replace state for this instance (null = closed) */
  findReplace: FindReplaceState | null;
  /** Note ID shown in the split pane (null = no split) */
  splitNoteId: string | null;
  /**
   * Timestamp (ms) of the last user-direct interaction with the tab strip
   * — clicks, renames, drags, modal opens, etc. Used to gate auto-move:
   * the active tab only slides to position 0 once the user has been idle
   * for a quiet period. `null` means no user interaction yet (e.g. fresh
   * mount / URL hydration), so auto-move stays disabled.
   */
  tabInteractionAt: number | null;
  /** Version-history side panel open in THIS instance (per-instance, persistable). */
  historyOpen: boolean;
}

/**
 * Quiet period (ms) before an idle active tab is moved to position 0.
 * Any user-direct tab action resets this window.
 */
export const TAB_AUTO_MOVE_IDLE_MS = 1500;

// ── Shared-with-me metadata ──────────────────────────────────────────────────

/** Effective grant level from `iam.permissions` (viewer < editor < admin). */
export type SharedNotePermissionLevel = "viewer" | "editor" | "admin";

export interface SharedNoteMeta {
  permissionLevel: SharedNotePermissionLevel;
  ownerEmail: string | null;
}

// ── Note Record (extends Note with all runtime tracking) ────────────────────

export interface NoteRecord extends Note {
  // ── Fetch tracking ─────────────────────────────────────────
  _fetchStatus: NoteFetchStatus | null;

  // ── Dirty / undo tracking ──────────────────────────────────
  _dirty: boolean;
  _dirtyFields: Set<NoteUndoableField>;
  _fieldHistory: NoteFieldSnapshot;
  _undoPast: NoteUndoEntry[];
  _undoFuture: NoteUndoEntry[];

  // ── Save tracking ──────────────────────────────────────────
  _saving: boolean;
  _lastSavedAt: number | null;
  _error: string | null;
  _loading: boolean;

  /**
   * How many save attempts have failed IN A ROW since the last success.
   * Reset to 0 by `markNoteSaved`. Once it reaches
   * `NOTE_SAVE_FAILURE_BLOCK_THRESHOLD` the editor stops relying on a toast
   * (dismissible, deduped, easy to ignore for 14 hours — D132) and raises a
   * blocking banner on the editor itself.
   */
  _consecutiveSaveFailures: number;
  /** Epoch ms of the FIRST failure in the current streak (null when clean). */
  _firstSaveFailureAt: number | null;

  /**
   * The exact field values THIS client last sent to the server (recorded when
   * the write is issued, not when it returns). A server payload carrying one
   * of these values is our own work coming back — never a collaborator's
   * change — so it must never be reported to the user as a conflict.
   *
   * Why it exists: our own write's realtime echo lands 50–500ms AFTER the REST
   * response. If the user kept typing in that window, the echo's (older) content
   * no longer matched the live buffer, and the dirty-record conflict check
   * declared a false "someone else edited this note". Comparing against the
   * live buffer alone can only ever answer "is this different from what I'm
   * typing right now?" — which is the wrong question.
   */
  _lastWrittenValues?: Partial<Record<NoteUndoableField, Note[NoteUndoableField]>>;

  // ── Auto-generated (client-only, never in DB while true) ───
  _isAutogenerated: boolean;

  // ── Shared-with-me (not owned by the current user) ─────────
  /** True when this note reached the store via the shared-with-me list.
   *  Owner-list selectors exclude these; the sidebar's "Shared with me"
   *  section is their only list surface. */
  _sharedWithMe: boolean;
  /** Effective permission level + owner identity for a shared note. */
  _sharedMeta: SharedNoteMeta | null;

  // ── Sync tracking ──────────────────────────────────────────
  _lastSyncedAt: number | null;
}

// ── Slice State ─────────────────────────────────────────────────────────────

export interface NotesSliceState {
  // ── Entity store ───────────────────────────────────────────
  notes: Record<string, NoteRecord>;
  /** Track IDs we've fetched full content for — never re-fetch unless refresh */
  fetchedNoteIds: Set<string>;
  listStatus: "idle" | "loading" | "loaded" | "error";
  listError: string | null;

  // ── Instance management (Layer 6) ──────────────────────────
  instances: Record<string, NotesInstance>;

  // ── Realtime ───────────────────────────────────────────────
  realtimeConnected: boolean;
  // ── Presence ───────────────────────────────────────────────
  /** Live editor attribution per note, derived from realtime `updated_by`
   *  (the DB `_stamp_actor` trigger stamps it — no presence channel needed).
   *  Entries are set by the realtime middleware on non-self UPDATEs and
   *  cleared by its idle timer. */
  noteEditors: Record<string, NoteEditorPresence>;

  // ── Scope assignments (for sidebar grouping by scope) ─────
  /** Denormalized scope assignments for all notes — loaded once on mount */
  noteScopeAssignments: NoteScopeAssignment[];
  noteScopesLoaded: boolean;
}

export interface NoteEditorPresence {
  userId: string;
  /** Editor's email once resolved via `get_user_emails_by_ids`; null while
   *  loading (UI falls back to "Someone"). */
  email: string | null;
  /** Epoch ms of the last realtime edit event from this user. */
  lastEditAt: number;
}

export interface NoteScopeAssignment {
  entity_id: string; // note ID
  scope_id: string;
  scope_name: string; // e.g., "SEO", "Acme Corp"
  scope_type: string; // e.g., "Department", "Client"
}

// ── Auto-save debounce config ───────────────────────────────────────────────

export function getAutoSaveDelay(contentLength: number): number {
  if (contentLength < 1000) return 3000;
  if (contentLength < 10000) return 5000;
  return 10000;
}

/**
 * Consecutive failed saves before the editor raises its blocking banner.
 *
 * Three, not one: a single failure is routinely transient (a lost wifi frame,
 * a stale optimistic lock) and already toasts. Three in a row means the write
 * path is genuinely broken for this note — the buffer is now the ONLY copy of
 * the user's work, which is the state D132 sat in for 14 hours.
 */
export const NOTE_SAVE_FAILURE_BLOCK_THRESHOLD = 3;

export function getReduxSyncDelay(contentLength: number): number {
  if (contentLength < 1000) return 200;
  if (contentLength < 10000) return 500;
  return 1000;
}

// ── Helpers to create records ───────────────────────────────────────────────

export function createBlankNoteRecord(note: Note): NoteRecord {
  return {
    ...note,
    _fetchStatus: null,
    _dirty: false,
    _dirtyFields: new Set(),
    _fieldHistory: {},
    _undoPast: [],
    _undoFuture: [],
    _loading: false,
    _saving: false,
    _lastSavedAt: null,
    _error: null,
    _consecutiveSaveFailures: 0,
    _firstSaveFailureAt: null,
    _isAutogenerated: false,
    _sharedWithMe: false,
    _sharedMeta: null,
    _lastSyncedAt: null,
  };
}

/**
 * Construct a fresh `NoteRecord` from a partial server note.
 *
 * `organization_id` is a NOT NULL column on `workbench.notes`, so it is part of
 * the REQUIRED input contract here — the caller must prove it has a real org id
 * before a record can be built. This is deliberately NOT `Partial<Note>`-loose
 * on that one field: an empty-string / fabricated org id would write an invalid
 * row into the store and silently mask an upstream bug (an incomplete
 * `Partial<Note>` reaching this constructor). The type forces the caller to
 * handle a missing org id loudly (see `upsertNoteFromServer` in slice.ts)
 * instead of this function inventing a placeholder.
 */
export function createBlankNoteRecordFromPartial(
  partial: Partial<Note> & { id: string; organization_id: string },
  status: NoteFetchStatus,
): NoteRecord {
  return {
    id: partial.id,
    label: partial.label ?? "New Note",
    content: partial.content ?? null,
    folder_name: partial.folder_name ?? null,
    folder_id: partial.folder_id ?? null,
    tags: partial.tags ?? null,
    metadata: partial.metadata ?? null,
    organization_id: partial.organization_id,
    project_id: partial.project_id ?? null,
    task_id: partial.task_id ?? null,
    deleted_at: partial.deleted_at ?? null,
    visibility: partial.visibility ?? "personal",
    version: partial.version ?? 1,
    sync_version: partial.sync_version ?? 0,
    content_hash: partial.content_hash ?? null,
    file_path: partial.file_path ?? null,
    last_device_id: partial.last_device_id ?? null,
    position: partial.position ?? null,
    created_at: partial.created_at ?? new Date().toISOString(),
    updated_at: partial.updated_at ?? new Date().toISOString(),
    created_by: partial.created_by ?? null,
    updated_by: partial.updated_by ?? null,
    _fetchStatus: status,
    _dirty: false,
    _dirtyFields: new Set(),
    _fieldHistory: {},
    _undoPast: [],
    _undoFuture: [],
    _loading: false,
    _saving: false,
    _lastSavedAt: null,
    _error: null,
    _consecutiveSaveFailures: 0,
    _firstSaveFailureAt: null,
    _isAutogenerated: false,
    _sharedWithMe: false,
    _sharedMeta: null,
    _lastSyncedAt: null,
  };
}

/** Create an auto-generated note (client-only, never touches DB until user edits) */
export function createAutogeneratedNoteRecord(
  id: string,
  userId: string,
  folder: string,
): NoteRecord {
  return {
    id,
    label: "New Note",
    content: null,
    folder_name: folder,
    folder_id: null,
    tags: null,
    metadata: null,
    organization_id: "",
    project_id: null,
    task_id: null,
    deleted_at: null,
    visibility: "personal",
    version: 1,
    sync_version: 0,
    content_hash: null,
    file_path: null,
    last_device_id: null,
    position: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: userId,
    updated_by: null,
    _fetchStatus: "full", // We "know" everything — it's empty
    _dirty: false,
    _dirtyFields: new Set(),
    _fieldHistory: {},
    _undoPast: [],
    _undoFuture: [],
    _loading: false,
    _saving: false,
    _lastSavedAt: null,
    _error: null,
    _consecutiveSaveFailures: 0,
    _firstSaveFailureAt: null,
    _isAutogenerated: true, // Client-only until user edits
    _sharedWithMe: false,
    _sharedMeta: null,
    _lastSyncedAt: Date.now(),
  };
}
