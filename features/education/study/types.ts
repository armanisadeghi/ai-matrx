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
/** Phase 3 (weak-area drill + streak) — one row per user, DB-trigger-written only. */
export type StudyStreakRow = Edu["study_streak"]["Row"];

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
  /**
   * A one-tap 1–5 self-rated confidence (Brainscape-style). When supplied it
   * drives the FSRS rating (uniquely able to reach Easy(4)) and — if `result`
   * is omitted — derives the coarse ledger result. The raw value is persisted
   * under `score.confidence` so the finer signal survives. See
   * `lib/srs/fsrs.ts#mapConfidenceToRating` / `#confidenceToResult`.
   */
  confidence?: number | null;
  score?: Record<string, unknown> | null;
  scoreValue?: number | null;
  responseKind?:
    "spoken" | "written" | "typed" | "handwritten" | "selected" | null;
  responseAudioFileId?: string | null;
  responseImageFileId?: string | null;
  responseTranscript?: string | null;
  latencyMs?: number | null;
  gradedBy?: string | null;
}

/**
 * A learner manually overriding their own attempt's grade — see
 * `study_override_attempt` (edu_study_attempt_manual_override.sql). Only the
 * attempt's `created_by` may call it; it flags `is_manually_edited`, preserves
 * the FIRST-ever grade in `original_*`, and replays `item_mastery` for that
 * item from its full attempt history (box/streak are sequential, so a
 * mid-history edit can't be patched in place).
 */
export interface OverrideAttemptInput {
  attemptId: string;
  result: "correct" | "partial" | "incorrect";
  scoreValue?: number | null;
  /** Merged into the existing `score` jsonb (e.g. an updated feedback note); omit to leave it as-is. */
  score?: Record<string, unknown> | null;
}

// ─── Session browsing (history / results UI) ──────────────────────────────────
/** Filters for `listSessions` — all optional; the RLS layer scopes to the user. */
export interface ListSessionsFilter {
  /** Restrict to one source set (study_session.source_set_id). */
  setId?: string;
  /** Restrict to one mode (e.g. 'fast_fire', 'classic_review'). */
  mode?: string;
  /** Restrict to one status ('active' | 'completed' | 'abandoned'). */
  status?: string;
  /** Phase 6 (analytics) — only sessions created on/after this ISO timestamp. */
  since?: string;
  limit?: number;
  offset?: number;
}

/** Phase 6 (analytics) — filters for the broad, cross-set `listAttempts`. */
export interface ListAttemptsFilter {
  /** Only attempts created on/after this ISO timestamp. */
  since?: string;
  limit?: number;
}

/** A session plus its ordered attempt ledger — what the session-detail view reads. */
export interface SessionWithAttempts {
  session: StudySessionRow;
  attempts: StudyAttemptRow[];
}

/** Rollup counts for a session row in the history list. */
export interface SessionAttemptSummary {
  total: number;
  correct: number;
  partial: number;
  incorrect: number;
  /** Mean of score_value (0-1) across graded attempts, as 0-100 — the same
   *  weighted metric the session scorecard leads with (see SessionScorecard). */
  avgScorePct: number | null;
  /** How many of this session's attempts have been manually score-overridden. */
  editedCount: number;
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

// ─── Planner (Phase 6 — real study_goal CRUD) ─────────────────────────────────
/**
 * `study_goal` has no dedicated topic/item_type/set columns — it's a generic
 * entity row (title/target_date/status/visibility) shared by every future
 * planner use, not just flashcards. Targeting info rides in `metadata` jsonb
 * so the column set never has to grow per-mode. The planner's heuristic
 * ranking (soonest target_date + highest struggle count) reads this back to
 * find the matching `item_mastery` rows.
 */
export interface StudyGoalMetadata {
  /** e.g. 'fc_card' — which study-spine item_type this goal targets. */
  itemType?: string;
  /** A free-form topic tag (matches `fc_card.topic` for flashcards). */
  topic?: string;
  /** Optional: scope the goal to one set instead of a whole topic. */
  setId?: string;
  [key: string]: unknown;
}

/**
 * The goal lifecycle vocabulary as a RUNTIME constant, so validators — the
 * surface write handlers in `planner/goalWrites.ts` — check against the one
 * source of truth instead of re-typing the literals. `GoalStatus` is derived
 * from it, so the type and the runtime list can never drift.
 *
 * Deliberately narrower than the DB check constraint, which also permits
 * 'paused': nothing in the app authors or renders a paused goal, so it is not
 * part of the vocabulary a user (or an agent) can select.
 */
export const GOAL_STATUSES = ["active", "achieved", "archived"] as const;

export type GoalStatus = (typeof GOAL_STATUSES)[number];

export interface NewGoalInput {
  title: string;
  targetDate?: string | null;
  status?: GoalStatus;
  metadata?: StudyGoalMetadata;
  /** Active-context org; if omitted the DB trigger falls back to the personal org. */
  orgId?: string;
}

export type GoalPatch = Partial<
  Pick<StudyGoalRow, "title" | "status" | "target_date" | "metadata">
>;

export interface ListGoalsFilter {
  status?: GoalStatus;
}
