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
  | "is_public";

export const NOTE_UNDOABLE_FIELDS: readonly NoteUndoableField[] = [
  "content",
  "label",
  "folder_name",
  "folder_id",
  "tags",
  "organization_id",
  "project_id",
  "task_id",
  "is_public",
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
}

/**
 * Quiet period (ms) before an idle active tab is moved to position 0.
 * Any user-direct tab action resets this window.
 */
export const TAB_AUTO_MOVE_IDLE_MS = 1500;

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

  // ── Auto-generated (client-only, never in DB while true) ───
  _isAutogenerated: boolean;

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
  /** Echo suppression: note IDs where we have a pending DB write.
   *  Producer-consumer: each save adds, each echo consumes. */
  _pendingDispatchIds: Set<string>;

  // ── Presence ───────────────────────────────────────────────
  /** Another user has the notes system open and made changes in last 60s */
  otherUsersActive: boolean;
  /** The currently active note is being edited by another user */
  activeNoteEditedByOthers: boolean;

  // ── Scope assignments (for sidebar grouping by scope) ─────
  /** Denormalized scope assignments for all notes — loaded once on mount */
  noteScopeAssignments: NoteScopeAssignment[];
  noteScopesLoaded: boolean;
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
    _isAutogenerated: false,
    _lastSyncedAt: null,
  };
}

export function createBlankNoteRecordFromPartial(
  partial: Partial<Note> & { id: string },
  status: NoteFetchStatus,
): NoteRecord {
  return {
    id: partial.id,
    user_id: partial.user_id ?? "",
    label: partial.label ?? "New Note",
    content: partial.content ?? null,
    folder_name: partial.folder_name ?? null,
    folder_id: partial.folder_id ?? null,
    tags: partial.tags ?? null,
    metadata: partial.metadata ?? null,
    shared_with: partial.shared_with ?? null,
    organization_id: partial.organization_id ?? null,
    project_id: partial.project_id ?? null,
    task_id: partial.task_id ?? null,
    is_deleted: partial.is_deleted ?? false,
    is_public: partial.is_public ?? false,
    version: partial.version ?? 1,
    sync_version: partial.sync_version ?? 0,
    content_hash: partial.content_hash ?? null,
    file_path: partial.file_path ?? null,
    last_device_id: partial.last_device_id ?? null,
    position: partial.position ?? null,
    created_at: partial.created_at ?? new Date().toISOString(),
    updated_at: partial.updated_at ?? new Date().toISOString(),
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
    _isAutogenerated: false,
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
    user_id: userId,
    label: "New Note",
    content: null,
    folder_name: folder,
    folder_id: null,
    tags: null,
    metadata: null,
    shared_with: null,
    organization_id: null,
    project_id: null,
    task_id: null,
    is_deleted: false,
    is_public: false,
    version: 1,
    sync_version: 0,
    content_hash: null,
    file_path: null,
    last_device_id: null,
    position: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
    _isAutogenerated: true, // Client-only until user edits
    _lastSyncedAt: Date.now(),
  };
}
