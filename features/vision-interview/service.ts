// features/vision-interview/service.ts
//
// Direct browser → Supabase for every plain DB read/write in the Vision
// Interview room (CLAUDE.md § Data flow: never route DB ops through Python).
// The Python backend is called ONLY for run orchestration (start / resume) —
// that wiring lives in hooks/useInterviewRun.ts, not here.
//
// Realtime: ONE channel per open room (turn / question / hole / session),
// per the supabase-realtime skill. Echo suppression is timestamp-monotonic
// and lives in the slice's upsert reducers (both realtime payloads and
// refetches flow through the same merge, so the guard cannot be bypassed);
// this module only owns the subscription lifecycle and early self-drops.

import { supabase } from "@/utils/supabase/client";
import { interviewDb } from "@/utils/supabase/interviewDb";
import { readAllRows } from "@/lib/supabase/readAllRows";
import { uniqueChannelTopic } from "@/utils/supabase/realtime";
import type {
  HoleClassification,
  HoleStatus,
  InterviewDocumentRevisionRow,
  InterviewHoleRow,
  InterviewQuestionRow,
  InterviewSessionRow,
  InterviewTurnRow,
  QuestionState,
} from "./types";

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST failure.",
  );
}

// ── Session CRUD ────────────────────────────────────────────────────────────

export interface CreateSessionInput {
  title: string;
  visionStatement: string;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<InterviewSessionRow> {
  const { data, error } = await interviewDb(supabase)
    .from("session")
    .insert({
      title: input.title.trim() || "Untitled interview",
      vision_statement: input.visionStatement.trim() || null,
    })
    .select("*")
    .single();
  if (error) throw pgError(error);
  return data as InterviewSessionRow;
}

export async function getSession(
  id: string,
): Promise<InterviewSessionRow | null> {
  const { data, error } = await interviewDb(supabase)
    .from("session")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw pgError(error);
  return (data as InterviewSessionRow | null) ?? null;
}

export async function renameSession(id: string, title: string): Promise<void> {
  const { error } = await interviewDb(supabase)
    .from("session")
    .update({ title: title.trim() || "Untitled interview" })
    .eq("id", id);
  if (error) throw pgError(error);
}

/**
 * Append pre-start composer text to the session's vision statement.
 *
 * The vision statement is HUMAN content (the FE-owned half of the session —
 * unlike `document`/`stage`/`current_round`, which are server-owned). The
 * backend seeds turn 0 from it on the first start, and it stays on the
 * session as durable context for every later run — so anything the user
 * composes before pressing Start is never lost (flow mandate: the composer
 * is alive before a run exists).
 */
export async function appendVisionStatement(
  id: string,
  addition: string,
): Promise<InterviewSessionRow> {
  const trimmed = addition.trim();
  const current = await getSession(id);
  if (!current) throw new Error("The session could not be loaded.");
  if (!trimmed) return current;
  const next = current.vision_statement?.trim()
    ? `${current.vision_statement.trim()}\n\n${trimmed}`
    : trimmed;
  const { data, error } = await interviewDb(supabase)
    .from("session")
    .update({ vision_statement: next })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw pgError(error);
  return data as InterviewSessionRow;
}

/** Soft delete — lifecycle marker only, never a hard DELETE from the client. */
export async function deleteSession(id: string): Promise<void> {
  const { error } = await interviewDb(supabase)
    .from("session")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw pgError(error);
}

// ── Room reads ──────────────────────────────────────────────────────────────
// The transcript and both ledgers feed completeness-sensitive UI (the whole
// conversation, every open question), so they read through readAllRows —
// a silently truncated transcript would be a confidently wrong room.

export async function listTurns(sessionId: string): Promise<InterviewTurnRow[]> {
  return readAllRows<InterviewTurnRow>(
    ({ from, to }) =>
      interviewDb(supabase)
        .from("turn")
        .select("*", { count: "exact" })
        .eq("session_id", sessionId)
        .order("round", { ascending: true })
        .order("position", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "interview.turn" },
  );
}

export async function listQuestions(
  sessionId: string,
): Promise<InterviewQuestionRow[]> {
  return readAllRows<InterviewQuestionRow>(
    ({ from, to }) =>
      interviewDb(supabase)
        .from("question")
        .select("*", { count: "exact" })
        .eq("session_id", sessionId)
        .order("position", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "interview.question" },
  );
}

export async function listHoles(
  sessionId: string,
): Promise<InterviewHoleRow[]> {
  return readAllRows<InterviewHoleRow>(
    ({ from, to }) =>
      interviewDb(supabase)
        .from("hole")
        .select("*", { count: "exact" })
        .eq("session_id", sessionId)
        .order("round_opened", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "interview.hole" },
  );
}

/** Revision METADATA only — the full markdown of every revision is never
 *  needed to render the count/history strip. */
export interface RevisionSummary {
  id: string;
  round: number;
  note: string | null;
  created_at: string;
}

export async function listRevisions(
  sessionId: string,
): Promise<RevisionSummary[]> {
  const { data, error } = await interviewDb(supabase)
    .from("document_revision")
    .select("id, round, note, created_at")
    .eq("session_id", sessionId)
    .order("round", { ascending: false })
    .order("id", { ascending: true })
    .limit(200);
  if (error) throw pgError(error);
  return (data ?? []) as RevisionSummary[];
}

export async function getRevisionDocument(
  revisionId: string,
): Promise<InterviewDocumentRevisionRow | null> {
  const { data, error } = await interviewDb(supabase)
    .from("document_revision")
    .select("*")
    .eq("id", revisionId)
    .maybeSingle();
  if (error) throw pgError(error);
  return (data as InterviewDocumentRevisionRow | null) ?? null;
}

// ── Ledger writes (defer / reopen / reclassify / accept risk / arbitrate) ───
// Every write returns the fresh row so the caller can merge it immediately;
// the realtime echo of the same write is then dropped by the slice's
// timestamp-monotonic guard (not newer than what we already merged).

export async function updateQuestionState(
  id: string,
  state: QuestionState,
): Promise<InterviewQuestionRow> {
  const { data, error } = await interviewDb(supabase)
    .from("question")
    .update({ state })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw pgError(error);
  return data as InterviewQuestionRow;
}

export interface HolePatch {
  classification?: HoleClassification;
  reclassified_by_human?: boolean;
  status?: HoleStatus;
  resolution?: string | null;
}

export async function updateHole(
  id: string,
  patch: HolePatch,
): Promise<InterviewHoleRow> {
  const { data, error } = await interviewDb(supabase)
    .from("hole")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw pgError(error);
  return data as InterviewHoleRow;
}

/** Reclassify a hole as the human — provenance kept via reclassified_by_human. */
export function reclassifyHole(
  id: string,
  classification: HoleClassification,
): Promise<InterviewHoleRow> {
  return updateHole(id, { classification, reclassified_by_human: true });
}

export function acceptHoleAsRisk(
  id: string,
  resolution?: string,
): Promise<InterviewHoleRow> {
  return updateHole(id, {
    status: "accepted_risk",
    resolution: resolution ?? null,
  });
}

// ── Raw-audio capture (v2 §13.1) ────────────────────────────────────────────

/**
 * Stamp the dictation recording's cld_files id onto a human turn. Guarded:
 * only lands on a turn that has no audio yet (`audio_file_id IS NULL`), so a
 * late retry or a second client can never clobber an existing association.
 * Returns the fresh row, or null when the guard refused (already stamped).
 */
export async function attachTurnAudio(
  turnId: string,
  fileId: string,
): Promise<InterviewTurnRow | null> {
  const { data, error } = await interviewDb(supabase)
    .from("turn")
    .update({ audio_file_id: fileId })
    .eq("id", turnId)
    .is("audio_file_id", null)
    .select("*")
    .maybeSingle();
  if (error) throw pgError(error);
  return (data as InterviewTurnRow | null) ?? null;
}

// ── Realtime ────────────────────────────────────────────────────────────────

export interface RoomRealtimeHandlers {
  onTurn: (row: InterviewTurnRow) => void;
  onQuestion: (row: InterviewQuestionRow) => void;
  onHole: (row: InterviewHoleRow) => void;
  onSession: (row: InterviewSessionRow) => void;
  /** Channel dropped (CHANNEL_ERROR / TIMED_OUT). The caller owns the
   *  backoff + catch-up refetch (realtime has no replay). */
  onChannelDown?: () => void;
}

/**
 * ONE channel for the whole room — turn / question / hole inserts+updates
 * filtered by session, plus the session row itself (stage, round, document).
 *
 * RLS authorizes delivery (interview.* components ride the parent session's
 * access), so there is no client-side owner filter. Echo suppression happens
 * in the slice merge — see the file header.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToRoom(
  sessionId: string,
  handlers: RoomRealtimeHandlers,
): () => void {
  const channel = supabase.channel(
    uniqueChannelTopic(`vision-interview:${sessionId}`),
  );

  const opts = (table: string) => ({
    event: "*" as const,
    schema: "interview",
    table,
    filter: `session_id=eq.${sessionId}`,
  });

  channel
    .on("postgres_changes", opts("turn"), (payload) => {
      if (payload.new && Object.keys(payload.new).length > 0) {
        handlers.onTurn(payload.new as InterviewTurnRow);
      }
    })
    .on("postgres_changes", opts("question"), (payload) => {
      if (payload.new && Object.keys(payload.new).length > 0) {
        handlers.onQuestion(payload.new as InterviewQuestionRow);
      }
    })
    .on("postgres_changes", opts("hole"), (payload) => {
      if (payload.new && Object.keys(payload.new).length > 0) {
        handlers.onHole(payload.new as InterviewHoleRow);
      }
    })
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "interview",
        table: "session",
        filter: `id=eq.${sessionId}`,
      },
      (payload) => {
        if (payload.new && Object.keys(payload.new).length > 0) {
          handlers.onSession(payload.new as InterviewSessionRow);
        }
      },
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        handlers.onChannelDown?.();
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
