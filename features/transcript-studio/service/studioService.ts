/**
 * features/transcript-studio/service/studioService.ts
 *
 * Supabase CRUD for transcript-studio. Phase 1 covers studio_sessions only.
 * Child tables (raw / cleaned / concept / module / runs / settings) get
 * their own service helpers in subsequent phases.
 *
 * snake_case (DB) ↔ camelCase (domain) mapping happens here so callers
 * never see DB casing.
 */

import { supabase } from "@/utils/supabase/client";
import { NEW_SESSION_DEFAULT_TITLE, DEFAULT_MODULE_ID } from "../constants";
import type {
  AssistantConversationRef,
  CleanupCustomSlot,
  CreateSessionInput,
  SessionContextItem,
  SessionSource,
  StudioSession,
  UpdateSessionInput,
} from "../types";

// The studio_* tables were created after the last DB types regeneration.
// Cast `from("studio_sessions")` through `unknown` to silence the strict
// table-name check until a follow-up regenerates types/database.types.ts.
// Runtime is unaffected — Supabase accepts any string.
type LooseSupabase = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};
const db = supabase as unknown as LooseSupabase;

// ── Mappers ───────────────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  project_id: string | null;
  is_public: boolean;
  transcript_id: string | null;
  title: string;
  status: StudioSession["status"];
  module_id: string;
  source: SessionSource;
  started_at: string;
  ended_at: string | null;
  total_duration_ms: number;
  audio_storage_path: string | null;
  is_deleted: boolean;
  assistant_conversation_id: string | null;
  assistant_conversations: AssistantConversationRef[] | null;
  created_at: string;
  updated_at: string;
}

export function rowToSession(row: SessionRow): StudioSession {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    isPublic: row.is_public,
    transcriptId: row.transcript_id,
    title: row.title,
    status: row.status,
    moduleId: row.module_id,
    source: row.source ?? "studio",
    startedAt: row.started_at,
    endedAt: row.ended_at,
    totalDurationMs: row.total_duration_ms,
    audioStoragePath: row.audio_storage_path,
    isDeleted: row.is_deleted,
    assistantConversationId: row.assistant_conversation_id ?? null,
    assistantConversations: Array.isArray(row.assistant_conversations)
      ? row.assistant_conversations
      : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── studio_sessions ───────────────────────────────────────────────────

/**
 * Source scoping for session lists. Each surface lists its own sessions by
 * default — the studio hides the high-volume cleanup sessions and vice versa.
 *   - omitted / "studio" → everything EXCEPT cleanup (`source <> 'cleanup'`,
 *     so future sources surface in the studio rather than vanish)
 *   - "cleanup"          → only cleanup sessions
 *   - "all"              → no source filter (either surface's "show all")
 */
export interface SessionListFilter {
  source?: SessionSource | "all";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySourceFilter(query: any, filter?: SessionListFilter) {
  const source = filter?.source ?? "studio";
  if (source === "all") return query;
  if (source === "studio") return query.neq("source", "cleanup");
  return query.eq("source", source);
}

export async function listSessions(
  filter?: SessionListFilter,
): Promise<StudioSession[]> {
  const { data, error } = await applySourceFilter(
    db.from("studio_sessions").select("*").eq("is_deleted", false),
    filter,
  )
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`[studio] listSessions failed: ${error.message}`);
  }
  return (data ?? []).map((row: SessionRow) => rowToSession(row));
}

export async function getSession(id: string): Promise<StudioSession | null> {
  const { data, error } = await db
    .from("studio_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`[studio] getSession failed: ${error.message}`);
  }
  return data ? rowToSession(data as SessionRow) : null;
}

export async function createSession(
  input: CreateSessionInput,
  userId: string,
): Promise<StudioSession> {
  const insert = {
    user_id: userId,
    organization_id: input.organizationId ?? null,
    project_id: input.projectId ?? null,
    transcript_id: input.transcriptId ?? null,
    title: input.title?.trim() || NEW_SESSION_DEFAULT_TITLE,
    module_id: input.moduleId ?? DEFAULT_MODULE_ID,
    source: input.source ?? "studio",
  };

  const { data, error } = await db
    .from("studio_sessions")
    .insert(insert)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `[studio] createSession failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return rowToSession(data as SessionRow);
}

export async function updateSession(
  id: string,
  patch: UpdateSessionInput,
): Promise<StudioSession | null> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.moduleId !== undefined) update.module_id = patch.moduleId;
  if (patch.endedAt !== undefined) update.ended_at = patch.endedAt;
  if (patch.totalDurationMs !== undefined)
    update.total_duration_ms = patch.totalDurationMs;
  if (patch.audioStoragePath !== undefined)
    update.audio_storage_path = patch.audioStoragePath;
  if (patch.transcriptId !== undefined)
    update.transcript_id = patch.transcriptId;
  if (patch.isDeleted !== undefined) update.is_deleted = patch.isDeleted;
  if (patch.assistantConversationId !== undefined)
    update.assistant_conversation_id = patch.assistantConversationId;
  if (patch.assistantConversations !== undefined)
    update.assistant_conversations = patch.assistantConversations;

  // maybeSingle (not single): the session row may be gone (deleted, or a
  // local/optimistic session never persisted) when a background update lands —
  // e.g. persisting the assistant conversation id. A real error still throws;
  // a missing row returns null so callers no-op instead of surfacing
  // PostgREST's "Cannot coerce the result to a single JSON object".
  const { data, error } = await db
    .from("studio_sessions")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`[studio] updateSession failed: ${error.message}`);
  }
  if (!data) return null;
  return rowToSession(data as SessionRow);
}

/**
 * Soft delete — flips is_deleted = true. Hard delete is reserved for admin.
 */
export async function softDeleteSession(id: string): Promise<void> {
  const { error } = await db
    .from("studio_sessions")
    .update({ is_deleted: true })
    .eq("id", id);
  if (error) {
    throw new Error(`[studio] softDeleteSession failed: ${error.message}`);
  }
}

// Server-side fetch for SSR hydration. Pass a server Supabase client built
// via utils/supabase/server.ts.
export async function listSessionsServer(
  serverClient: {
    from: (table: string) => unknown;
  },
  filter?: SessionListFilter,
): Promise<StudioSession[]> {
  const looseClient = serverClient as unknown as LooseSupabase;
  const { data, error } = await applySourceFilter(
    looseClient.from("studio_sessions").select("*").eq("is_deleted", false),
    filter,
  )
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) {
    throw new Error(`[studio] listSessionsServer failed: ${error.message}`);
  }
  return ((data ?? []) as SessionRow[]).map(rowToSession);
}

export async function getSessionServer(
  serverClient: {
    from: (table: string) => unknown;
  },
  id: string,
): Promise<StudioSession | null> {
  const looseClient = serverClient as unknown as LooseSupabase;
  const { data, error } = await looseClient
    .from("studio_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`[studio] getSessionServer failed: ${error.message}`);
  }
  return data ? rowToSession(data as SessionRow) : null;
}

// ── studio_raw_segments ───────────────────────────────────────────────

export interface RawSegmentRow {
  id: string;
  session_id: string;
  recording_segment_id: string | null;
  chunk_index: number;
  t_start: number | string;
  t_end: number | string;
  text: string;
  speaker: string | null;
  source: import("../types").RawSegmentSource;
}

export function rowToRawSegment(
  row: RawSegmentRow,
): import("../types").RawSegment {
  return {
    id: row.id,
    sessionId: row.session_id,
    recordingSegmentId: row.recording_segment_id,
    chunkIndex: row.chunk_index,
    tStart: typeof row.t_start === "string" ? Number(row.t_start) : row.t_start,
    tEnd: typeof row.t_end === "string" ? Number(row.t_end) : row.t_end,
    text: row.text,
    speaker: row.speaker,
    source: row.source,
  };
}

export interface InsertRawSegmentInput {
  sessionId: string;
  chunkIndex: number;
  tStart: number;
  tEnd: number;
  text: string;
  recordingSegmentId?: string | null;
  speaker?: string | null;
  source?: import("../types").RawSegmentSource;
}

export async function insertRawSegment(
  input: InsertRawSegmentInput,
): Promise<import("../types").RawSegment> {
  const { data, error } = await db
    .from("studio_raw_segments")
    .insert({
      session_id: input.sessionId,
      recording_segment_id: input.recordingSegmentId ?? null,
      chunk_index: input.chunkIndex,
      t_start: input.tStart,
      t_end: input.tEnd,
      text: input.text,
      speaker: input.speaker ?? null,
      source: input.source ?? "chunk",
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[studio] insertRawSegment failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToRawSegment(data as RawSegmentRow);
}

export async function listRawSegments(
  sessionId: string,
): Promise<import("../types").RawSegment[]> {
  const { data, error } = await db
    .from("studio_raw_segments")
    .select("*")
    .eq("session_id", sessionId)
    .order("t_start", { ascending: true });
  if (error) {
    throw new Error(`[studio] listRawSegments failed: ${error.message}`);
  }
  return ((data ?? []) as RawSegmentRow[]).map(rowToRawSegment);
}

export async function listRawSegmentsServer(
  serverClient: { from: (table: string) => unknown },
  sessionId: string,
): Promise<import("../types").RawSegment[]> {
  const looseClient = serverClient as unknown as LooseSupabase;
  const { data, error } = await looseClient
    .from("studio_raw_segments")
    .select("*")
    .eq("session_id", sessionId)
    .order("t_start", { ascending: true });
  if (error) {
    throw new Error(`[studio] listRawSegmentsServer failed: ${error.message}`);
  }
  return ((data ?? []) as RawSegmentRow[]).map(rowToRawSegment);
}

/** Update the text of a single raw segment. Used by the inline editor. */
export async function updateRawSegmentText(
  id: string,
  text: string,
): Promise<import("../types").RawSegment> {
  const { data, error } = await db
    .from("studio_raw_segments")
    .update({ text })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[studio] updateRawSegmentText failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToRawSegment(data as RawSegmentRow);
}

/** Hard-delete a raw segment. Use case: corrective edits on noisy chunks. */
export async function deleteRawSegment(id: string): Promise<void> {
  const { error } = await db.from("studio_raw_segments").delete().eq("id", id);
  if (error) {
    throw new Error(`[studio] deleteRawSegment failed: ${error.message}`);
  }
}

// ── studio_recording_segments ────────────────────────────────────────
// One row per start→stop cycle. `audio_path` holds the durable cld_files
// fileId for the cycle's assembled audio (set on finalize). Raw chunks link
// back via studio_raw_segments.recording_segment_id so each "card" in the
// mobile UI is an independently playable, independently deletable unit.

export interface RecordingSegmentRow {
  id: string;
  session_id: string;
  segment_index: number;
  t_start: number | string;
  t_end: number | string | null;
  audio_path: string | null;
  started_at: string;
  ended_at: string | null;
  archived_at: string | null;
  detached_at: string | null;
  user_id: string | null;
}

export function rowToRecordingSegment(
  row: RecordingSegmentRow,
): import("../types").RecordingSegment {
  return {
    id: row.id,
    sessionId: row.session_id,
    segmentIndex: row.segment_index,
    tStart: typeof row.t_start === "string" ? Number(row.t_start) : row.t_start,
    tEnd:
      row.t_end === null
        ? null
        : typeof row.t_end === "string"
          ? Number(row.t_end)
          : row.t_end,
    audioPath: row.audio_path,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    archivedAt: row.archived_at ?? null,
    detachedAt: row.detached_at ?? null,
    userId: row.user_id ?? null,
  };
}

/**
 * Set the soft-remove state of a recording: archive / unarchive (in-place) or
 * detach / restore (global Unsorted pool). All four are simple timestamp flips.
 */
export async function setRecordingSegmentState(
  id: string,
  patch: { archivedAt?: string | null; detachedAt?: string | null },
): Promise<import("../types").RecordingSegment | null> {
  const update: Record<string, unknown> = {};
  if (patch.archivedAt !== undefined) update.archived_at = patch.archivedAt;
  if (patch.detachedAt !== undefined) update.detached_at = patch.detachedAt;
  // maybeSingle (not single): the row may have been deleted out from under us
  // (manual delete / discard race). A real error still throws; a gone row
  // returns null so callers can no-op instead of surfacing PostgREST's cryptic
  // "Cannot coerce the result to a single JSON object".
  const { data, error } = await db
    .from("studio_recording_segments")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    throw new Error(
      `[studio] setRecordingSegmentState failed: ${error.message}`,
    );
  }
  if (!data) return null;
  return rowToRecordingSegment(data as RecordingSegmentRow);
}

/** All of a user's detached ("Unsorted") recordings, newest first. */
export async function listUnsortedRecordingSegments(
  userId: string,
): Promise<import("../types").RecordingSegment[]> {
  const { data, error } = await db
    .from("studio_recording_segments")
    .select("*")
    .eq("user_id", userId)
    .not("detached_at", "is", null)
    .order("detached_at", { ascending: false });
  if (error) {
    throw new Error(
      `[studio] listUnsortedRecordingSegments failed: ${error.message}`,
    );
  }
  return ((data ?? []) as RecordingSegmentRow[]).map(rowToRecordingSegment);
}

export async function insertRecordingSegment(
  input: import("../types").CreateRecordingSegmentInput,
): Promise<import("../types").RecordingSegment> {
  const { data, error } = await db
    .from("studio_recording_segments")
    .insert({
      session_id: input.sessionId,
      segment_index: input.segmentIndex,
      t_start: input.tStart,
      started_at: input.startedAt,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[studio] insertRecordingSegment failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToRecordingSegment(data as RecordingSegmentRow);
}

export async function updateRecordingSegment(
  id: string,
  patch: import("../types").UpdateRecordingSegmentInput,
): Promise<import("../types").RecordingSegment | null> {
  const update: Record<string, unknown> = {};
  if (patch.audioPath !== undefined) update.audio_path = patch.audioPath;
  if (patch.tEnd !== undefined) update.t_end = patch.tEnd;
  if (patch.endedAt !== undefined) update.ended_at = patch.endedAt;
  // maybeSingle (not single): a background finalize / audio-upload can land
  // after the recording was deleted or discarded. A gone row returns null
  // (callers no-op) rather than throwing PostgREST's "Cannot coerce the result
  // to a single JSON object"; genuine errors still throw.
  const { data, error } = await db
    .from("studio_recording_segments")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    throw new Error(`[studio] updateRecordingSegment failed: ${error.message}`);
  }
  if (!data) return null;
  return rowToRecordingSegment(data as RecordingSegmentRow);
}

export async function listRecordingSegments(
  sessionId: string,
): Promise<import("../types").RecordingSegment[]> {
  const { data, error } = await db
    .from("studio_recording_segments")
    .select("*")
    .eq("session_id", sessionId)
    .order("segment_index", { ascending: true });
  if (error) {
    throw new Error(`[studio] listRecordingSegments failed: ${error.message}`);
  }
  return ((data ?? []) as RecordingSegmentRow[]).map(rowToRecordingSegment);
}

export async function listRecordingSegmentsServer(
  serverClient: { from: (table: string) => unknown },
  sessionId: string,
): Promise<import("../types").RecordingSegment[]> {
  const looseClient = serverClient as unknown as LooseSupabase;
  const { data, error } = await looseClient
    .from("studio_recording_segments")
    .select("*")
    .eq("session_id", sessionId)
    .order("segment_index", { ascending: true });
  if (error) {
    throw new Error(
      `[studio] listRecordingSegmentsServer failed: ${error.message}`,
    );
  }
  return ((data ?? []) as RecordingSegmentRow[]).map(rowToRecordingSegment);
}

/**
 * Delete a recording segment and every raw chunk that belongs to it. We delete
 * the raw rows explicitly (the FK is ON DELETE SET NULL, which would orphan the
 * transcript text rather than remove it). The mobile "card delete" is meant to
 * throw away the whole recording — audio + transcript — so we remove both.
 */
export async function deleteRecordingSegment(id: string): Promise<void> {
  const { error: rawError } = await db
    .from("studio_raw_segments")
    .delete()
    .eq("recording_segment_id", id);
  if (rawError) {
    throw new Error(
      `[studio] deleteRecordingSegment (raw) failed: ${rawError.message}`,
    );
  }
  const { error } = await db
    .from("studio_recording_segments")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(`[studio] deleteRecordingSegment failed: ${error.message}`);
  }
}

// ── studio_documents ─────────────────────────────────────────────────

export interface StudioDocumentRow {
  id: string;
  session_id: string;
  kind: string;
  title: string;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export function rowToStudioDocument(
  row: StudioDocumentRow,
): import("../types").StudioDocument {
  return {
    id: row.id,
    sessionId: row.session_id,
    kind: row.kind,
    title: row.title,
    content: row.content,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listStudioDocuments(
  sessionId: string,
): Promise<import("../types").StudioDocument[]> {
  const { data, error } = await db
    .from("studio_documents")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`[studio] listStudioDocuments failed: ${error.message}`);
  }
  return ((data ?? []) as StudioDocumentRow[]).map(rowToStudioDocument);
}

/**
 * Get the session's working document, creating it on first access. Relies on
 * the UNIQUE (session_id, kind) constraint so a concurrent create resolves to
 * a single row (we re-select on conflict).
 */
export async function getOrCreateWorkingDocument(
  sessionId: string,
  kind: import("../types").StudioDocumentKind = "working_document",
  title = "Working Document",
): Promise<import("../types").StudioDocument> {
  const existing = await db
    .from("studio_documents")
    .select("*")
    .eq("session_id", sessionId)
    .eq("kind", kind)
    .maybeSingle();
  if (existing.error) {
    throw new Error(
      `[studio] getOrCreateWorkingDocument select failed: ${existing.error.message}`,
    );
  }
  if (existing.data) {
    return rowToStudioDocument(existing.data as StudioDocumentRow);
  }

  const { data, error } = await db
    .from("studio_documents")
    .insert({ session_id: sessionId, kind, title })
    .select("*")
    .single();
  if (error) {
    // A concurrent insert won the race — re-read the now-existing row.
    const retry = await db
      .from("studio_documents")
      .select("*")
      .eq("session_id", sessionId)
      .eq("kind", kind)
      .maybeSingle();
    if (retry.data) return rowToStudioDocument(retry.data as StudioDocumentRow);
    throw new Error(
      `[studio] getOrCreateWorkingDocument insert failed: ${error.message}`,
    );
  }
  return rowToStudioDocument(data as StudioDocumentRow);
}

/**
 * Upsert a non-working-document studio_documents row by (session_id, kind).
 * Used today by the Scribe cleanup flow (kind="scribe_cleanup"): one durable
 * row per session that the assistantContextBuilder picks up as the
 * `cleaned_transcripts` named context entry.
 *
 * Uses the `UNIQUE (session_id, kind)` constraint so concurrent runs converge
 * on a single row. `version` is left to its column default on insert; existing
 * rows keep their version (no auto-bump — we don't need optimistic concurrency
 * for one-shot cleanup writes).
 */
export async function upsertStudioDocument(
  sessionId: string,
  kind: import("../types").StudioDocumentKind,
  patch: { content: string; title?: string },
): Promise<import("../types").StudioDocument> {
  const row: Record<string, unknown> = {
    session_id: sessionId,
    kind,
    content: patch.content,
  };
  if (patch.title !== undefined) row.title = patch.title;

  const { data, error } = await db
    .from("studio_documents")
    .upsert(row, { onConflict: "session_id,kind" })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[studio] upsertStudioDocument failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToStudioDocument(data as StudioDocumentRow);
}

/**
 * Direct content write (used by inline edits on the client). The assistant's
 * own edits land server-side via the ctx_patch writeback handler and arrive
 * back through realtime — they do NOT go through this path.
 */
export async function updateStudioDocumentContent(
  id: string,
  content: string,
): Promise<import("../types").StudioDocument> {
  const { data, error } = await db
    .from("studio_documents")
    .update({ content })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[studio] updateStudioDocumentContent failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToStudioDocument(data as StudioDocumentRow);
}

// ── studio_runs ───────────────────────────────────────────────────────

interface AgentRunRow {
  id: string;
  session_id: string;
  column_idx: number;
  conversation_id: string | null;
  shortcut_id: string | null;
  trigger_cause: import("../types").TriggerCause;
  input_char_range: string | null;
  resume_marker: string | null;
  status: import("../types").RunStatus;
  started_at: string | null;
  ended_at: string | null;
  error: string | null;
}

function rowToAgentRun(row: AgentRunRow): import("../types").AgentRun {
  // Postgres int4range serializes as "[a,b)" — parse if present.
  let inputCharRange: [number, number] | null = null;
  if (row.input_char_range) {
    const m = row.input_char_range.match(/^[\[(](\d+),(\d+)[\])]$/);
    if (m) inputCharRange = [Number(m[1]), Number(m[2])];
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    columnIdx: row.column_idx as 2 | 3 | 4,
    conversationId: row.conversation_id,
    shortcutId: row.shortcut_id,
    triggerCause: row.trigger_cause,
    inputCharRange,
    resumeMarker: row.resume_marker,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    error: row.error,
  };
}

export interface InsertAgentRunInput {
  sessionId: string;
  columnIdx: 2 | 3 | 4;
  shortcutId: string;
  triggerCause: import("../types").TriggerCause;
  resumeMarker?: string | null;
  inputCharRange?: [number, number] | null;
}

export async function insertAgentRun(
  input: InsertAgentRunInput,
): Promise<import("../types").AgentRun> {
  const insert: Record<string, unknown> = {
    session_id: input.sessionId,
    column_idx: input.columnIdx,
    shortcut_id: input.shortcutId,
    trigger_cause: input.triggerCause,
    status: "running",
    started_at: new Date().toISOString(),
  };
  if (input.resumeMarker !== undefined)
    insert.resume_marker = input.resumeMarker;
  if (input.inputCharRange) {
    insert.input_char_range = `[${input.inputCharRange[0]},${input.inputCharRange[1]})`;
  }
  const { data, error } = await db
    .from("studio_runs")
    .insert(insert)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[studio] insertAgentRun failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToAgentRun(data as AgentRunRow);
}

export interface FinalizeAgentRunInput {
  id: string;
  status: "complete" | "failed";
  conversationId?: string | null;
  error?: string | null;
}

export async function finalizeAgentRun(
  input: FinalizeAgentRunInput,
): Promise<import("../types").AgentRun> {
  const update: Record<string, unknown> = {
    status: input.status,
    ended_at: new Date().toISOString(),
  };
  if (input.conversationId !== undefined)
    update.conversation_id = input.conversationId;
  if (input.error !== undefined) update.error = input.error;
  const { data, error } = await db
    .from("studio_runs")
    .update(update)
    .eq("id", input.id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[studio] finalizeAgentRun failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToAgentRun(data as AgentRunRow);
}

// ── studio_cleaned_segments ──────────────────────────────────────────

export interface CleanedSegmentRow {
  id: string;
  session_id: string;
  run_id: string | null;
  pass_index: number;
  t_start: number | string;
  t_end: number | string;
  text: string;
  trigger_cause: import("../types").TriggerCause;
  superseded_at: string | null;
  recording_segment_id: string | null;
  processor_key?: string | null;
}

export function rowToCleanedSegment(
  row: CleanedSegmentRow,
): import("../types").CleanedSegment {
  return {
    id: row.id,
    sessionId: row.session_id,
    runId: row.run_id,
    passIndex: row.pass_index,
    tStart: typeof row.t_start === "string" ? Number(row.t_start) : row.t_start,
    tEnd: typeof row.t_end === "string" ? Number(row.t_end) : row.t_end,
    text: row.text,
    triggerCause: row.trigger_cause,
    supersededAt: row.superseded_at,
    recordingSegmentId: row.recording_segment_id ?? null,
    processorKey: row.processor_key ?? "clean",
  };
}

export async function listCleanedSegments(
  sessionId: string,
): Promise<import("../types").CleanedSegment[]> {
  // Active rows only — superseded ones stay in the DB for audit but never
  // surface to the UI.
  const { data, error } = await db
    .from("studio_cleaned_segments")
    .select("*")
    .eq("session_id", sessionId)
    .is("superseded_at", null)
    .order("t_start", { ascending: true });
  if (error) {
    throw new Error(`[studio] listCleanedSegments failed: ${error.message}`);
  }
  return ((data ?? []) as CleanedSegmentRow[]).map(rowToCleanedSegment);
}

export async function listCleanedSegmentsServer(
  serverClient: { from: (table: string) => unknown },
  sessionId: string,
): Promise<import("../types").CleanedSegment[]> {
  const looseClient = serverClient as unknown as LooseSupabase;
  const { data, error } = await looseClient
    .from("studio_cleaned_segments")
    .select("*")
    .eq("session_id", sessionId)
    .is("superseded_at", null)
    .order("t_start", { ascending: true });
  if (error) {
    throw new Error(
      `[studio] listCleanedSegmentsServer failed: ${error.message}`,
    );
  }
  return ((data ?? []) as CleanedSegmentRow[]).map(rowToCleanedSegment);
}

/**
 * Atomically insert a new cleaned segment AND mark prior overlapping segments
 * as superseded. The supersede pass stamps any active row whose `t_start >=
 * replaceFromTime` so the next list query returns only the latest pass for
 * each time range.
 *
 * Performed as two sequential statements (Supabase doesn't expose explicit
 * transactions over PostgREST). The supersede update happens FIRST so a
 * concurrent reader can never see two overlapping active rows.
 */
export interface ApplyCleanupRunInput {
  sessionId: string;
  runId: string;
  passIndex: number;
  tStart: number;
  tEnd: number;
  text: string;
  triggerCause: import("../types").TriggerCause;
  /**
   * Recording-aligned cleaning: anchor this clean to its source recording.
   * When set, supersession is scoped to the SAME recording (re-running a
   * recording's clean replaces only that recording's prior clean) instead of
   * the time-based `t_start >=` window used by the Studio's interval cleaner.
   */
  recordingSegmentId?: string | null;
  /**
   * Per-segment processor key. Defaults to 'clean' (built-in cleaning). Custom
   * per-segment processors pass their own key; supersession and the row are
   * scoped to that key so processors never overwrite each other or the clean.
   */
  processorKey?: string;
}

export async function applyCleanupRun(
  input: ApplyCleanupRunInput,
): Promise<import("../types").CleanedSegment> {
  const supersedeAt = new Date().toISOString();
  const recordingAligned =
    input.recordingSegmentId !== undefined && input.recordingSegmentId !== null;
  const processorKey = input.processorKey ?? "clean";

  // Step 1: stamp prior rows as superseded — always scoped to this processor key.
  //  - Recording-aligned: only this recording's prior output for this processor.
  //  - Time-windowed (Studio): any active row at/after this window's start.
  let supersedeQuery = db
    .from("studio_cleaned_segments")
    .update({ superseded_at: supersedeAt })
    .eq("session_id", input.sessionId)
    .eq("processor_key", processorKey)
    .is("superseded_at", null);
  supersedeQuery = recordingAligned
    ? supersedeQuery.eq(
        "recording_segment_id",
        input.recordingSegmentId as string,
      )
    : supersedeQuery.gte("t_start", input.tStart);
  const { error: supersedeError } = await supersedeQuery;
  if (supersedeError) {
    throw new Error(
      `[studio] applyCleanupRun supersede failed: ${supersedeError.message}`,
    );
  }

  // Step 2: insert the new active row.
  const insertRow: Record<string, unknown> = {
    session_id: input.sessionId,
    run_id: input.runId,
    pass_index: input.passIndex,
    t_start: input.tStart,
    t_end: input.tEnd,
    text: input.text,
    trigger_cause: input.triggerCause,
    processor_key: processorKey,
  };
  if (recordingAligned)
    insertRow.recording_segment_id = input.recordingSegmentId;
  const { data, error: insertError } = await db
    .from("studio_cleaned_segments")
    .insert(insertRow)
    .select("*")
    .single();
  if (insertError || !data) {
    throw new Error(
      `[studio] applyCleanupRun insert failed: ${insertError?.message ?? "no row"}`,
    );
  }
  return rowToCleanedSegment(data as CleanedSegmentRow);
}

/** Update the text of a cleaned segment in place (no supersession). */
export async function updateCleanedSegmentText(
  id: string,
  text: string,
): Promise<import("../types").CleanedSegment> {
  const { data, error } = await db
    .from("studio_cleaned_segments")
    .update({ text })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[studio] updateCleanedSegmentText failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToCleanedSegment(data as CleanedSegmentRow);
}

/** Hard-delete a cleaned segment. Audit trail (`studio_runs`) is unaffected. */
export async function deleteCleanedSegment(id: string): Promise<void> {
  const { error } = await db
    .from("studio_cleaned_segments")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(`[studio] deleteCleanedSegment failed: ${error.message}`);
  }
}

// ── studio_concept_items ─────────────────────────────────────────────

export interface ConceptItemRow {
  id: string;
  session_id: string;
  run_id: string | null;
  pass_index: number;
  t_start: number | string | null;
  t_end: number | string | null;
  kind: import("../types").ConceptKind;
  label: string;
  description: string | null;
  confidence: number | null;
}

export function rowToConceptItem(
  row: ConceptItemRow,
): import("../types").ConceptItem {
  return {
    id: row.id,
    sessionId: row.session_id,
    runId: row.run_id,
    passIndex: row.pass_index,
    tStart:
      row.t_start === null
        ? null
        : typeof row.t_start === "string"
          ? Number(row.t_start)
          : row.t_start,
    tEnd:
      row.t_end === null
        ? null
        : typeof row.t_end === "string"
          ? Number(row.t_end)
          : row.t_end,
    kind: row.kind,
    label: row.label,
    description: row.description,
    confidence: row.confidence,
  };
}

export interface InsertConceptItemInput {
  sessionId: string;
  runId: string;
  passIndex: number;
  kind: import("../types").ConceptKind;
  label: string;
  description?: string | null;
  tStart?: number | null;
  tEnd?: number | null;
  confidence?: number | null;
}

export async function insertConceptItems(
  inputs: InsertConceptItemInput[],
): Promise<import("../types").ConceptItem[]> {
  if (inputs.length === 0) return [];
  const rows = inputs.map((i) => ({
    session_id: i.sessionId,
    run_id: i.runId,
    pass_index: i.passIndex,
    kind: i.kind,
    label: i.label,
    description: i.description ?? null,
    t_start: i.tStart ?? null,
    t_end: i.tEnd ?? null,
    confidence: i.confidence ?? null,
  }));
  const { data, error } = await db
    .from("studio_concept_items")
    .insert(rows)
    .select("*");
  if (error || !data) {
    throw new Error(
      `[studio] insertConceptItems failed: ${error?.message ?? "no rows"}`,
    );
  }
  return (data as ConceptItemRow[]).map(rowToConceptItem);
}

export async function listConceptItems(
  sessionId: string,
): Promise<import("../types").ConceptItem[]> {
  const { data, error } = await db
    .from("studio_concept_items")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`[studio] listConceptItems failed: ${error.message}`);
  }
  return ((data ?? []) as ConceptItemRow[]).map(rowToConceptItem);
}

export async function listConceptItemsServer(
  serverClient: { from: (table: string) => unknown },
  sessionId: string,
): Promise<import("../types").ConceptItem[]> {
  const looseClient = serverClient as unknown as LooseSupabase;
  const { data, error } = await looseClient
    .from("studio_concept_items")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`[studio] listConceptItemsServer failed: ${error.message}`);
  }
  return ((data ?? []) as ConceptItemRow[]).map(rowToConceptItem);
}

export interface ConceptItemPatch {
  kind?: import("../types").ConceptKind;
  label?: string;
  description?: string | null;
  confidence?: number | null;
}

/** Update fields on a concept item. Only `label`, `description`, `kind`,
 *  `confidence` are user-editable. */
export async function updateConceptItem(
  id: string,
  patch: ConceptItemPatch,
): Promise<import("../types").ConceptItem> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.kind !== undefined) dbPatch.kind = patch.kind;
  if (patch.label !== undefined) dbPatch.label = patch.label;
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.confidence !== undefined) dbPatch.confidence = patch.confidence;
  const { data, error } = await db
    .from("studio_concept_items")
    .update(dbPatch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[studio] updateConceptItem failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToConceptItem(data as ConceptItemRow);
}

export async function deleteConceptItem(id: string): Promise<void> {
  const { error } = await db.from("studio_concept_items").delete().eq("id", id);
  if (error) {
    throw new Error(`[studio] deleteConceptItem failed: ${error.message}`);
  }
}

// ── studio_module_segments ───────────────────────────────────────────

export interface ModuleSegmentRow {
  id: string;
  session_id: string;
  run_id: string | null;
  pass_index: number;
  module_id: string;
  block_type: string;
  t_start: number | string | null;
  t_end: number | string | null;
  payload: unknown;
}

export function rowToModuleSegment(
  row: ModuleSegmentRow,
): import("../types").ModuleSegment {
  return {
    id: row.id,
    sessionId: row.session_id,
    runId: row.run_id,
    passIndex: row.pass_index,
    moduleId: row.module_id,
    blockType: row.block_type,
    tStart:
      row.t_start === null
        ? null
        : typeof row.t_start === "string"
          ? Number(row.t_start)
          : row.t_start,
    tEnd:
      row.t_end === null
        ? null
        : typeof row.t_end === "string"
          ? Number(row.t_end)
          : row.t_end,
    payload: row.payload,
  };
}

export interface InsertModuleSegmentInput {
  sessionId: string;
  runId: string;
  passIndex: number;
  moduleId: string;
  blockType: string;
  tStart?: number | null;
  tEnd?: number | null;
  payload: unknown;
}

export async function insertModuleSegments(
  inputs: InsertModuleSegmentInput[],
): Promise<import("../types").ModuleSegment[]> {
  if (inputs.length === 0) return [];
  const rows = inputs.map((i) => ({
    session_id: i.sessionId,
    run_id: i.runId,
    pass_index: i.passIndex,
    module_id: i.moduleId,
    block_type: i.blockType,
    t_start: i.tStart ?? null,
    t_end: i.tEnd ?? null,
    payload: i.payload,
  }));
  const { data, error } = await db
    .from("studio_module_segments")
    .insert(rows)
    .select("*");
  if (error || !data) {
    throw new Error(
      `[studio] insertModuleSegments failed: ${error?.message ?? "no rows"}`,
    );
  }
  return (data as ModuleSegmentRow[]).map(rowToModuleSegment);
}

export async function listModuleSegments(
  sessionId: string,
): Promise<import("../types").ModuleSegment[]> {
  const { data, error } = await db
    .from("studio_module_segments")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`[studio] listModuleSegments failed: ${error.message}`);
  }
  return ((data ?? []) as ModuleSegmentRow[]).map(rowToModuleSegment);
}

export async function listModuleSegmentsServer(
  serverClient: { from: (table: string) => unknown },
  sessionId: string,
): Promise<import("../types").ModuleSegment[]> {
  const looseClient = serverClient as unknown as LooseSupabase;
  const { data, error } = await looseClient
    .from("studio_module_segments")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(
      `[studio] listModuleSegmentsServer failed: ${error.message}`,
    );
  }
  return ((data ?? []) as ModuleSegmentRow[]).map(rowToModuleSegment);
}

/** Update the payload of a module segment. Used by the inline editor. */
export async function updateModuleSegmentPayload(
  id: string,
  payload: unknown,
): Promise<import("../types").ModuleSegment> {
  const { data, error } = await db
    .from("studio_module_segments")
    .update({ payload })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[studio] updateModuleSegmentPayload failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToModuleSegment(data as ModuleSegmentRow);
}

export async function deleteModuleSegment(id: string): Promise<void> {
  const { error } = await db
    .from("studio_module_segments")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(`[studio] deleteModuleSegment failed: ${error.message}`);
  }
}

// ── studio_session_settings ──────────────────────────────────────────

interface SessionSettingsRow {
  session_id: string;
  cleaning_shortcut_id: string | null;
  cleaning_interval_ms: number;
  concept_shortcut_id: string | null;
  concept_interval_ms: number;
  module_id: string;
  module_shortcut_id: string | null;
  module_interval_ms: number | null;
  column_widths: number[] | null;
  show_prior_modules: boolean;
  context_items: SessionContextItem[] | null;
  custom_slots: CleanupCustomSlot[] | null;
}

function rowToSessionSettings(
  row: SessionSettingsRow,
): import("../types").SessionSettings & { showPriorModules: boolean } {
  return {
    sessionId: row.session_id,
    cleaningShortcutId: row.cleaning_shortcut_id,
    cleaningIntervalMs: row.cleaning_interval_ms,
    conceptShortcutId: row.concept_shortcut_id,
    conceptIntervalMs: row.concept_interval_ms,
    moduleId: row.module_id,
    moduleShortcutId: row.module_shortcut_id,
    moduleIntervalMs: row.module_interval_ms,
    columnWidths: row.column_widths,
    showPriorModules: row.show_prior_modules,
    contextItems: Array.isArray(row.context_items) ? row.context_items : null,
    customSlots: Array.isArray(row.custom_slots) ? row.custom_slots : null,
  };
}

export async function fetchSessionSettings(
  sessionId: string,
): Promise<
  (import("../types").SessionSettings & { showPriorModules: boolean }) | null
> {
  const { data, error } = await db
    .from("studio_session_settings")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) {
    throw new Error(`[studio] fetchSessionSettings failed: ${error.message}`);
  }
  return data ? rowToSessionSettings(data as SessionSettingsRow) : null;
}

export interface UpsertSessionSettingsInput {
  sessionId: string;
  cleaningShortcutId?: string | null;
  cleaningIntervalMs?: number;
  conceptShortcutId?: string | null;
  conceptIntervalMs?: number;
  moduleId?: string;
  moduleShortcutId?: string | null;
  moduleIntervalMs?: number | null;
  columnWidths?: number[] | null;
  showPriorModules?: boolean;
  contextItems?: SessionContextItem[] | null;
  customSlots?: CleanupCustomSlot[] | null;
}

/**
 * Upsert per-session settings. Only the fields present on `input` are
 * written; missing fields preserve their existing DB values (for an
 * existing row) or fall back to the column defaults (for a new row).
 *
 * The `studio_session_settings` table has DB-level CHECK constraints on
 * the interval bounds — caller-side clamping in `IntervalSlider` is just
 * UI hygiene; the DB is the final guard.
 */
export async function upsertSessionSettings(
  input: UpsertSessionSettingsInput,
): Promise<import("../types").SessionSettings & { showPriorModules: boolean }> {
  const update: Record<string, unknown> = {
    session_id: input.sessionId,
  };
  if (input.cleaningShortcutId !== undefined)
    update.cleaning_shortcut_id = input.cleaningShortcutId;
  if (input.cleaningIntervalMs !== undefined)
    update.cleaning_interval_ms = input.cleaningIntervalMs;
  if (input.conceptShortcutId !== undefined)
    update.concept_shortcut_id = input.conceptShortcutId;
  if (input.conceptIntervalMs !== undefined)
    update.concept_interval_ms = input.conceptIntervalMs;
  if (input.moduleId !== undefined) update.module_id = input.moduleId;
  if (input.moduleShortcutId !== undefined)
    update.module_shortcut_id = input.moduleShortcutId;
  if (input.moduleIntervalMs !== undefined)
    update.module_interval_ms = input.moduleIntervalMs;
  if (input.columnWidths !== undefined)
    update.column_widths = input.columnWidths;
  if (input.showPriorModules !== undefined)
    update.show_prior_modules = input.showPriorModules;
  if (input.contextItems !== undefined)
    update.context_items = input.contextItems;
  if (input.customSlots !== undefined) update.custom_slots = input.customSlots;

  const { data, error } = await db
    .from("studio_session_settings")
    .upsert(update, { onConflict: "session_id" })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(
      `[studio] upsertSessionSettings failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToSessionSettings(data as SessionSettingsRow);
}
