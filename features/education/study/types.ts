// features/education/study/types.ts
//
// Canonical types for the shared STUDY SPINE in the `education` schema:
// study_session / study_attempt / item_mastery / study_goal. This spine is
// mode-agnostic — flashcards, quizzes, practice tests, spoken drills all write
// the same ledger keyed by (item_type, item_id) — so it lives here, not under
// any one mode's feature (`features/flashcards/` derives its row types from the
// `education` schema too, but performance/mastery is owned here).
//
// All row types are derived from the generated `education` schema; never
// hand-redefine a column shape. Writes to attempts go through the
// `study_record_attempt` RPC (the only path that atomically updates mastery) —
// see `service/studyService.ts`.

import type { Database } from "@/types/database.types";

type Edu = Database["education"]["Tables"];

// ─── Row types (generated source of truth) ────────────────────────────────────
export type StudySessionRow = Edu["study_session"]["Row"];
export type StudyAttemptRow = Edu["study_attempt"]["Row"];
export type ItemMasteryRow = Edu["item_mastery"]["Row"];
export type StudyGoalRow = Edu["study_goal"]["Row"];

// ─── Service result (supabase-style; services never throw) ────────────────────
export interface StudyResult<T> {
  data: T | null;
  error: string | null;
}

// ─── Item reference — the polymorphic key every study row is keyed by ─────────
/**
 * The (type, id) pair that identifies a studyable item across modes.
 * `itemType` is a free-form tag (e.g. 'fc_card', 'quiz_question'); `itemId` is
 * the item's UUID in its owning table.
 */
export interface ItemRef {
  itemType: string;
  itemId: string;
}

// ─── Authoring inputs ─────────────────────────────────────────────────────────
/**
 * What a caller supplies to open a study session. Org is optional — when
 * omitted the `_stamp_org_default` trigger fills the creator's personal org.
 */
export interface NewSessionInput {
  mode: string;
  /** Active-context org; if omitted the DB trigger falls back to the personal org. */
  orgId?: string;
  sourceKind?: string | null;
  sourceSetId?: string | null;
  sourceQuery?: Record<string, unknown> | null;
  settings?: Record<string, unknown>;
  status?: string;
  visibility?: Database["platform"]["Enums"]["visibility"];
  metadata?: Record<string, unknown>;
}

/**
 * The `study_record_attempt` RPC arguments, in camelCase. Mirrors the DB
 * function signature exactly:
 *
 *   study_record_attempt(p_item_type, p_item_id, p_session_id, p_method,
 *     p_result, p_score, p_score_value, p_response_kind,
 *     p_response_audio_file_id, p_response_image_file_id,
 *     p_response_transcript, p_latency_ms, p_graded_by) returns jsonb
 *
 * The RPC is the ONLY attempt writer: it appends the immutable ledger row AND
 * atomically advances `item_mastery` in one transaction.
 */
export interface RecordAttemptInput {
  itemType: string;
  itemId: string;
  sessionId?: string | null;
  method?: string;
  result?: "correct" | "partial" | "incorrect";
  score?: Record<string, unknown> | null;
  scoreValue?: number | null;
  responseKind?: "spoken" | "written" | "typed" | "handwritten" | "selected" | null;
  responseAudioFileId?: string | null;
  responseImageFileId?: string | null;
  responseTranscript?: string | null;
  latencyMs?: number | null;
  gradedBy?: string | null;
}

// ─── Session patch (what updateSession accepts) ───────────────────────────────
export type SessionPatch = Partial<
  Pick<
    StudySessionRow,
    | "status"
    | "ended_at"
    | "aggregate_score"
    | "session_audio_file_id"
    | "session_transcript"
    | "session_review"
    | "settings"
  >
>;
