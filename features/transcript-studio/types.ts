/**
 * features/transcript-studio/types.ts
 *
 * Domain types for the 4-column live transcription studio. The single
 * load-bearing convention: every segment carries `tStart` and `tEnd` —
 * seconds elapsed from session start, paused time excluded.
 */

export type SessionStatus =
  | "idle"
  | "recording"
  | "paused"
  | "stopped"
  | "errored";

export type RunStatus = "queued" | "running" | "complete" | "failed";

export type TriggerCause =
  | "interval"
  | "session-start"
  | "session-stop"
  | "manual"
  | "module-switch";

export type ModuleId = "tasks" | "flashcards" | "decisions" | "quiz" | string;

/**
 * Which surface created (and primarily owns) a session. Both surfaces share
 * the same tables — `source` only scopes each surface's DEFAULT session list.
 * Either view may opt into showing all sources; nothing else keys off it.
 *   - "studio"  — the 4-column transcript studio (sophisticated sessions)
 *   - "cleanup" — the high-volume transcription cleanup page
 */
export type SessionSource = "studio" | "cleanup" | (string & {});

export type RawSegmentSource = "chunk" | "fallback" | "imported" | "manual";

export type ConceptKind =
  | "theme"
  | "key_idea"
  | "entity"
  | "question"
  | "other";

// ── DB row shapes (camelCase domain types) ────────────────────────────

export interface StudioSession {
  id: string;
  userId: string;
  organizationId: string | null;
  projectId: string | null;
  isPublic: boolean;
  transcriptId: string | null;

  title: string;
  status: SessionStatus;
  moduleId: ModuleId;
  /** Origin surface — scopes each surface's default session list. */
  source: SessionSource;
  startedAt: string;
  endedAt: string | null;
  totalDurationMs: number;
  audioStoragePath: string | null;
  isDeleted: boolean;
  /**
   * The audio-first assistant's persisted conversation id (cx_conversation.id).
   * Durable so the Assistant screen reuses one conversation across refreshes
   * and rehydrates its history instead of starting fresh each mount.
   */
  assistantConversationId: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface RecordingSegment {
  id: string;
  sessionId: string;
  segmentIndex: number;
  tStart: number;
  tEnd: number | null;
  audioPath: string | null;
  startedAt: string;
  endedAt: string | null;
  /** Set when archived (hidden from the session list, recoverable in-place). */
  archivedAt: string | null;
  /** Set when detached from the session (lives in the global Unsorted pool). */
  detachedAt: string | null;
  /** Denormalized owner (from the parent session) for the cross-session Unsorted query. */
  userId: string | null;
}

export interface RawSegment {
  id: string;
  sessionId: string;
  recordingSegmentId: string | null;
  chunkIndex: number;
  tStart: number;
  tEnd: number;
  text: string;
  speaker: string | null;
  source: RawSegmentSource;
}

export interface CleanedSegment {
  id: string;
  sessionId: string;
  runId: string | null;
  passIndex: number;
  tStart: number;
  tEnd: number;
  text: string;
  triggerCause: TriggerCause;
  supersededAt: string | null;
  /**
   * Source recording this clean was derived from (recording-aligned cleaning).
   * NULL for Studio time-windowed passes not tied to a single recording.
   */
  recordingSegmentId: string | null;
  /**
   * Which per-segment processor produced this row. 'clean' = built-in cleaning
   * (the default, and the only key that feeds the canonical session clean).
   * Custom per-segment processors use their own slot key.
   */
  processorKey: string;
}

export interface ConceptItem {
  id: string;
  sessionId: string;
  runId: string | null;
  passIndex: number;
  tStart: number | null;
  tEnd: number | null;
  kind: ConceptKind;
  label: string;
  description: string | null;
  confidence: number | null;
}

export interface ModuleSegment {
  id: string;
  sessionId: string;
  runId: string | null;
  passIndex: number;
  moduleId: ModuleId;
  blockType: string;
  tStart: number | null;
  tEnd: number | null;
  payload: unknown;
}

export interface AgentRun {
  id: string;
  sessionId: string;
  columnIdx: 2 | 3 | 4;
  conversationId: string | null;
  shortcutId: string | null;
  triggerCause: TriggerCause;
  inputCharRange: [number, number] | null;
  resumeMarker: string | null;
  status: RunStatus;
  startedAt: string | null;
  endedAt: string | null;
  error: string | null;
}

/**
 * studio_documents — the collaborative "working document" the audio-first
 * assistant builds with the user. Edited server-side via `ctx_patch` (backend
 * writeback handler kind="studio_document"). Structurally separate from
 * `studio_cleaned_segments` so the auto-cleanup version is never overwritten.
 *
 * Known kinds:
 *   - "working_document" — the live assistant-edited doc (column 3 / Assistant
 *     screen). Default; what `getOrCreateWorkingDocument` returns.
 *   - "scribe_cleanup"   — Scribe one-shot cleanup output. A duplicate of the
 *     session's raw transcripts, run through a user-picked cleanup agent and
 *     persisted so the assistant has a single readable copy in context
 *     (see `assistantContextBuilder` -> `cleaned_transcripts`).
 *
 * The `kind` column is free text at the DB level with `UNIQUE (session_id,
 * kind)`; the type intersection below preserves the open string while
 * surfacing autocomplete for the two known values.
 */
export const SCRIBE_CLEANUP_DOC_KIND = "scribe_cleanup" as const;
export const WORKING_DOCUMENT_DOC_KIND = "working_document" as const;

export type StudioDocumentKind =
  | "working_document"
  | "scribe_cleanup"
  | (string & {});

export interface StudioDocument {
  id: string;
  sessionId: string;
  kind: StudioDocumentKind;
  title: string;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One user-authored context item for a session. Items are passed to agents as
 * proper context entries at invocation time (key → context slot when the key
 * matches an agent-declared slot; ad-hoc otherwise). `key` is derived from
 * `label` (slugified) unless the user names it explicitly.
 */
export interface SessionContextItem {
  id: string;
  key: string;
  label: string;
  value: string;
  /** Optional link back to a Note (the cleanup page's notes-backed blocks). */
  noteId?: string | null;
  noteLabel?: string | null;
}

/**
 * One "custom" output slot on the cleanup page. The output text lives in
 * `studio_documents` under `docKind` (UNIQUE(session_id, kind)); this record
 * tracks WHICH agent fills it and how it auto-runs.
 *   - source "raw"   → autorun fires alongside the cleaning pass
 *   - source "clean" → autorun fires when the cleaned result lands
 */
export interface CleanupCustomSlot {
  id: string;
  agentId: string | null;
  label?: string;
  source: "raw" | "clean";
  autoRun: boolean;
  /** studio_documents.kind for this slot ('cleanup_custom' for the first). */
  docKind: string;
}

export interface SessionSettings {
  sessionId: string;
  cleaningShortcutId: string | null;
  cleaningIntervalMs: number;
  conceptShortcutId: string | null;
  conceptIntervalMs: number;
  moduleId: ModuleId;
  moduleShortcutId: string | null;
  moduleIntervalMs: number | null;
  columnWidths: number[] | null;
  /** Column 4 history visibility — when true, shows prior module segments
   * in addition to the active module's segments. */
  showPriorModules: boolean;
  /** Per-session user context items, passed to agents as context entries. */
  contextItems: SessionContextItem[] | null;
  /** Cleanup-page custom output slots. Null = single legacy slot. */
  customSlots: CleanupCustomSlot[] | null;
}

// ── Inputs for service layer ──────────────────────────────────────────

export interface CreateSessionInput {
  title?: string;
  organizationId?: string | null;
  projectId?: string | null;
  transcriptId?: string | null;
  moduleId?: ModuleId;
  /** Origin surface. Defaults to "studio" (DB default). */
  source?: SessionSource;
}

export interface UpdateSessionInput {
  title?: string;
  status?: SessionStatus;
  moduleId?: ModuleId;
  endedAt?: string | null;
  totalDurationMs?: number;
  audioStoragePath?: string | null;
  transcriptId?: string | null;
  isDeleted?: boolean;
  assistantConversationId?: string | null;
}

export interface CreateRecordingSegmentInput {
  sessionId: string;
  segmentIndex: number;
  tStart: number;
  startedAt: string;
}

export interface UpdateRecordingSegmentInput {
  audioPath?: string | null;
  tEnd?: number | null;
  endedAt?: string | null;
}

// ── View-model helpers ────────────────────────────────────────────────

export interface StudioViewConfig {
  /** Whether to render the session-list sidebar. False in compact window mode. */
  showSidebar?: boolean;
  /** Whether to expose the right-edge settings panel. */
  showSettings?: boolean;
  /** When set, hydrates and locks the view to a specific session. */
  initialSessionId?: string | null;
  /** Chrome variant: "page" uses the global header portal; "window" doesn't. */
  containerVariant: "page" | "window";
  /**
   * Server-read studio columns layout (panel id -> percentage). When provided,
   * the 4-column shell paints with these widths on the very first frame so
   * the user doesn't see a flash of the auto-distributed default. Pass
   * `decodeStudioLayoutCookie(cookies().get(STUDIO_COLUMN_COOKIE_NAME)?.value)`
   * from the route handler.
   */
  defaultColumnLayout?: Record<string, number>;
  /**
   * Server-read sidebar/main split (panel id -> percentage). Same pattern as
   * `defaultColumnLayout` but for the resizable split between the sessions
   * sidebar and the active-session column shell.
   */
  defaultSidebarLayout?: Record<string, number>;
}
