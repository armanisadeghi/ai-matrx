// features/education/study/service/studyService.ts
//
// Canonical STUDY-SPINE service: study_session / study_attempt / item_mastery
// in the `education` schema. Mode-agnostic — every study mode (flashcards,
// quizzes, practice tests, spoken drills) opens a session here and records
// attempts through the SAME `study_record_attempt` RPC, which is the only path
// that atomically advances mastery. Reads go direct via supabase-js (RLS-gated).
// Never throws — every method returns `StudyResult<T>`.
//
// Why a service (not ad-hoc `.from()` at callsites): the attempt-writer must be
// a single chokepoint so no mode can bypass the mastery update. Adding a mode
// means calling `recordAttempt` with a new `itemType`, nothing else.

"use client";

import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { FsrsState } from "@/lib/srs/fsrs";
import {
  mapResultToRating,
  nextState,
  retrievability as fsrsRetrievability,
} from "@/lib/srs/fsrs";
import { masteryToFsrsState } from "../utils/masteryFsrs";
import type {
  StudyResult,
  StudySessionRow,
  StudyAttemptRow,
  ItemMasteryRow,
  ItemRef,
  NewSessionInput,
  RecordAttemptInput,
  OverrideAttemptInput,
  SessionPatch,
  ListSessionsFilter,
  ListAttemptsFilter,
  SessionWithAttempts,
  SessionAttemptSummary,
  StudyStreakRow,
  StudyGoalRow,
  NewGoalInput,
  GoalPatch,
  ListGoalsFilter,
} from "../types";

const EDU = () => supabase.schema("education");

function fail<T>(context: string, error: unknown): StudyResult<T> {
  const message = describeError(error);
  // Log the DESCRIBED message in the string itself — passing the raw error object
  // as a console arg serializes to a useless "[object Object]" in the Error
  // Inspector. Keep the raw object as a trailing arg for devtools drill-down.
  console.error(`[studyService] ${context}: ${message}`, error);
  return { data: null, error: `${context}: ${message}` };
}

/**
 * Surface PostgREST/DB errors loudly (message + details + hint + code), never a
 * bare "[object Object]" or an opaque "Unknown error". Supabase PostgREST errors
 * are plain objects (not `Error` instances) carrying `{ message, details, hint,
 * code }`; some failures (auth, network, fetch) arrive in other shapes — so when
 * none of the known fields are present we dump the raw object rather than hide it.
 */
function describeError(error: unknown): string {
  if (error == null) return "Unknown error";
  if (error instanceof Error) return error.message || error.name || "Error";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const e = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    const parts = [
      e.message,
      e.details,
      e.hint && `hint: ${e.hint}`,
      e.code && `(${e.code})`,
    ].filter(Boolean);
    if (parts.length) return parts.join(" — ");
    // No recognizable PostgREST fields — serialize the raw shape so the real
    // cause is never swallowed (an empty `{}` still beats "[object Object]").
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") return json;
    } catch {
      /* circular / non-serializable — fall through */
    }
  }
  return "Unknown error";
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A transient HTTP status worth retrying — a server / edge / gateway / network
 * hiccup, NOT a real DB rejection (4xx like 401/403/409 are deterministic and
 * must surface, not loop). PostgREST auto-retries idempotent GETs on transient
 * 5xx/520/503 but NEVER POSTs (its RETRYABLE_METHODS is GET/HEAD/OPTIONS only),
 * so a transient hiccup on an INSERT would otherwise surface as a hard failure —
 * exactly the message-less edge error that the old logging hid as "Unknown error".
 */
function isTransientStatus(status: number | undefined): boolean {
  return (
    status === undefined ||
    status === 0 ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

/** Shape the `study_record_attempt` RPC returns: `{ attempt_id, mastery }`. */
interface RecordAttemptRpcResult {
  attempt_id: string;
  mastery: ItemMasteryRow;
}

function isRecordAttemptResult(
  value: unknown,
): value is RecordAttemptRpcResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { attempt_id?: unknown }).attempt_id === "string" &&
    typeof (value as { mastery?: unknown }).mastery === "object" &&
    (value as { mastery?: unknown }).mastery !== null
  );
}

/** Shape the `study_override_attempt` RPC returns: `{ attempt, mastery }`. */
interface OverrideAttemptRpcResult {
  attempt: StudyAttemptRow;
  mastery: ItemMasteryRow;
}

function isOverrideAttemptResult(
  value: unknown,
): value is OverrideAttemptRpcResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { attempt?: unknown }).attempt === "object" &&
    (value as { attempt?: unknown }).attempt !== null &&
    typeof (value as { mastery?: unknown }).mastery === "object" &&
    (value as { mastery?: unknown }).mastery !== null
  );
}

export const studyService = {
  // ─── SESSIONS ───────────────────────────────────────────────────────────
  /**
   * Open a study session. `organization_id` is omitted unless `orgId` is given,
   * so the `_stamp_org_default` trigger fills the creator's personal org.
   */
  async createSession(
    input: NewSessionInput,
  ): Promise<StudyResult<StudySessionRow>> {
    const payload = {
      ...(input.orgId ? { organization_id: input.orgId } : {}),
      mode: input.mode,
      source_kind: input.sourceKind ?? null,
      source_set_id: input.sourceSetId ?? null,
      source_query: (input.sourceQuery ?? null) as never,
      settings: (input.settings ?? {}) as never,
      ...(input.status ? { status: input.status } : {}),
      ...(input.visibility ? { visibility: input.visibility } : {}),
      metadata: (input.metadata ?? {}) as never,
    } as never;

    // Opening a session is best-effort and SAFE TO REPEAT: a duplicate session
    // row is harmless (it is only a grouping — mastery is advanced exclusively by
    // recordAttempt, never here, so no double-count). PostgREST does not retry
    // POSTs on transient 5xx/edge errors, so we retry the insert ourselves on a
    // transient status — loudly (every retry screams), and only on transient
    // statuses so deterministic rejections (401/403/409/22xxx/23xxx) fail fast.
    // NOTE: this retry must NEVER be lifted to recordAttempt — that POST is a
    // non-idempotent ledger append; repeating it would double the mastery update.
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const lastAttempt = attempt === MAX_ATTEMPTS;
      try {
        const { data, error, status } = await EDU()
          .from("study_session")
          .insert(payload)
          .select("*")
          .single();
        if (!error) return { data: data as StudySessionRow, error: null };
        if (!lastAttempt && isTransientStatus(status)) {
          console.warn(
            `[studyService] createSession transient failure (status ${status ?? "none"}) — retry ${attempt}/${MAX_ATTEMPTS - 1}: ${describeError(error)}`,
          );
          await sleep(250 * attempt);
          continue;
        }
        return fail("createSession", error);
      } catch (e) {
        // A thrown rejection here is a network/abort failure (also transient).
        if (!lastAttempt) {
          console.warn(
            `[studyService] createSession threw — retry ${attempt}/${MAX_ATTEMPTS - 1}: ${describeError(e)}`,
          );
          await sleep(250 * attempt);
          continue;
        }
        return fail("createSession", e);
      }
    }
    // Unreachable (the loop always returns), but satisfies the type checker.
    return fail("createSession", "exhausted retries");
  },

  /**
   * The current user's study sessions (RLS-scoped), newest-first. Optional
   * filters narrow by source set, mode, and status. This is the read path the
   * sessions-history / results UI consumes — the mode-agnostic spine means the
   * same browser serves flashcards, quizzes, and every future mode.
   */
  async listSessions(
    filter: ListSessionsFilter = {},
  ): Promise<StudyResult<StudySessionRow[]>> {
    try {
      let q = EDU().from("study_session").select("*").is("deleted_at", null);
      if (filter.setId) q = q.eq("source_set_id", filter.setId);
      if (filter.mode) q = q.eq("mode", filter.mode);
      if (filter.status) q = q.eq("status", filter.status);
      if (filter.since) q = q.gte("created_at", filter.since);
      q = q.order("created_at", { ascending: false });
      if (filter.limit != null) {
        const offset = filter.offset ?? 0;
        q = q.range(offset, offset + filter.limit - 1);
      }
      const { data, error } = await q;
      if (error) return fail("listSessions", error);
      return { data: (data ?? []) as StudySessionRow[], error: null };
    } catch (e) {
      return fail("listSessions", e);
    }
  },

  /** Attempt rollups for many sessions — powers the history list stats line. */
  async getAttemptSummariesForSessions(
    sessionIds: string[],
  ): Promise<StudyResult<Record<string, SessionAttemptSummary>>> {
    if (sessionIds.length === 0) return { data: {}, error: null };
    try {
      const { data, error } = await EDU()
        .from("study_attempt")
        .select("session_id, result, score_value, is_manually_edited")
        .in("session_id", sessionIds)
        .is("deleted_at", null);
      if (error) return fail("getAttemptSummariesForSessions", error);
      const scoreSums: Record<string, { sum: number; count: number }> = {};
      const map: Record<string, SessionAttemptSummary> = {};
      for (const row of data ?? []) {
        const sid = row.session_id;
        if (!sid) continue;
        const summary = map[sid] ?? {
          total: 0,
          correct: 0,
          partial: 0,
          incorrect: 0,
          avgScorePct: null,
          editedCount: 0,
        };
        summary.total += 1;
        if (row.result === "correct") summary.correct += 1;
        else if (row.result === "partial") summary.partial += 1;
        else if (row.result === "incorrect") summary.incorrect += 1;
        if (row.is_manually_edited) summary.editedCount += 1;
        map[sid] = summary;
        if (row.score_value != null) {
          const agg = scoreSums[sid] ?? { sum: 0, count: 0 };
          agg.sum += Number(row.score_value);
          agg.count += 1;
          scoreSums[sid] = agg;
        }
      }
      for (const [sid, agg] of Object.entries(scoreSums)) {
        if (agg.count > 0) {
          map[sid].avgScorePct = Math.round((agg.sum / agg.count) * 100);
        }
      }
      return { data: map, error: null };
    } catch (e) {
      return fail("getAttemptSummariesForSessions", e);
    }
  },

  /** One session + its ordered attempt ledger (RLS-gated). null session = not found/hidden. */
  async getSession(
    sessionId: string,
  ): Promise<StudyResult<SessionWithAttempts | null>> {
    try {
      const { data: session, error: sErr } = await EDU()
        .from("study_session")
        .select("*")
        .eq("id", sessionId)
        .is("deleted_at", null)
        .maybeSingle();
      if (sErr) return fail("getSession", sErr);
      if (!session) return { data: null, error: null };
      const { data: attempts, error: aErr } = await EDU()
        .from("study_attempt")
        .select("*")
        .eq("session_id", sessionId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (aErr) return fail("getSession", aErr);
      return {
        data: {
          session: session as StudySessionRow,
          attempts: (attempts ?? []) as StudyAttemptRow[],
        },
        error: null,
      };
    } catch (e) {
      return fail("getSession", e);
    }
  },

  /** Soft-delete a session (sets deleted_at; attempts/mastery are untouched). */
  async deleteSession(sessionId: string): Promise<StudyResult<{ id: string }>> {
    try {
      const { data, error } = await EDU()
        .from("study_session")
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq("id", sessionId)
        .select("id")
        .single();
      if (error) return fail("deleteSession", error);
      return { data: { id: (data as { id: string }).id }, error: null };
    } catch (e) {
      return fail("deleteSession", e);
    }
  },

  /** Patch a session — status / ended_at / aggregate_score / audio / transcript / review / settings. */
  async updateSession(
    id: string,
    patch: SessionPatch,
  ): Promise<StudyResult<StudySessionRow>> {
    try {
      const { data, error } = await EDU()
        .from("study_session")
        .update(patch as never)
        .eq("id", id)
        .select("*")
        .single();
      if (error) return fail("updateSession", error);
      return { data: data as StudySessionRow, error: null };
    } catch (e) {
      return fail("updateSession", e);
    }
  },

  // ─── ATTEMPTS (the canonical, mastery-updating writer) ───────────────────
  /**
   * Record one study attempt. Calls the `study_record_attempt` RPC, which
   * appends the immutable ledger row AND atomically updates `item_mastery`,
   * then unpacks the returned jsonb into `{ attemptId, mastery }`.
   *
   * This is the ONLY attempt writer — every study mode funnels through it so
   * mastery can never drift from the ledger.
   *
   * Phase 2 (FSRS): for a graded result, this reads the item's PRIOR mastery
   * row, converts it to `FsrsState` (null if never reviewed under FSRS — no
   * box-history backfill, by design), and calls `lib/srs/fsrs.ts#nextState`
   * to compute the next difficulty/stability/due/lapses BEFORE calling the
   * RPC. The RPC is a dumb atomic writer of that pre-computed state — see
   * `migrations/edu_study_fsrs_scheduler.sql` for why the math never runs in
   * SQL. Callers are unaffected: the FSRS step is fully internal here.
   */
  async recordAttempt(
    input: RecordAttemptInput,
  ): Promise<StudyResult<{ attemptId: string; mastery: ItemMasteryRow }>> {
    try {
      let fsrsParams: Record<string, unknown> = {};
      if (input.result != null) {
        const priorRes = await this.getMastery({
          itemType: input.itemType,
          itemId: input.itemId,
        });
        if (priorRes.error) return fail("recordAttempt", priorRes.error);
        const prev = masteryToFsrsState(priorRes.data);
        const now = new Date();
        const rating = mapResultToRating(input.result);
        const next = nextState(prev, rating, now);
        fsrsParams = {
          p_difficulty: next.difficulty,
          p_stability: next.stability,
          p_due_at: next.due,
          p_retrievability: fsrsRetrievability(next, now),
          p_lapses: next.lapses,
        };
      }

      const { data, error } = await supabase.rpc("study_record_attempt", {
        p_item_type: input.itemType,
        p_item_id: input.itemId,
        ...(input.sessionId != null ? { p_session_id: input.sessionId } : {}),
        ...(input.method != null ? { p_method: input.method } : {}),
        ...(input.result != null ? { p_result: input.result } : {}),
        ...(input.score != null ? { p_score: input.score as never } : {}),
        ...(input.scoreValue != null
          ? { p_score_value: input.scoreValue }
          : {}),
        ...(input.responseKind != null
          ? { p_response_kind: input.responseKind }
          : {}),
        ...(input.responseAudioFileId != null
          ? { p_response_audio_file_id: input.responseAudioFileId }
          : {}),
        ...(input.responseImageFileId != null
          ? { p_response_image_file_id: input.responseImageFileId }
          : {}),
        ...(input.responseTranscript != null
          ? { p_response_transcript: input.responseTranscript }
          : {}),
        ...(input.latencyMs != null ? { p_latency_ms: input.latencyMs } : {}),
        ...(input.gradedBy != null ? { p_graded_by: input.gradedBy } : {}),
        ...fsrsParams,
      });
      if (error) return fail("recordAttempt", error);
      if (!isRecordAttemptResult(data)) {
        return fail("recordAttempt", "RPC returned an unexpected shape");
      }
      return {
        data: { attemptId: data.attempt_id, mastery: data.mastery },
        error: null,
      };
    } catch (e) {
      return fail("recordAttempt", e);
    }
  },

  /**
   * The unified cross-mode attempt history for one item, oldest-first. This is
   * the input an external scheduler (e.g. `lib/srs/fsrs.ts`) replays to compute
   * the next review state.
   */
  async attemptsForItem(
    item: ItemRef,
  ): Promise<StudyResult<StudyAttemptRow[]>> {
    try {
      const { data, error } = await EDU()
        .from("study_attempt")
        .select("*")
        .eq("item_type", item.itemType)
        .eq("item_id", item.itemId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) return fail("attemptsForItem", error);
      return { data: (data ?? []) as StudyAttemptRow[], error: null };
    } catch (e) {
      return fail("attemptsForItem", e);
    }
  },

  /**
   * A learner overrides their own past attempt's grade (e.g. the AI grader
   * marked something wrong that was actually right). Calls the
   * `study_override_attempt` RPC, which flags `is_manually_edited`, preserves
   * the first-ever grade in `original_*`, and replays `item_mastery` for that
   * item from its FULL attempt history — box/streak are sequential, so this
   * can never be a delta patch. The RPC itself checks `created_by = auth.uid()`;
   * it is not exposed for editing someone else's attempt.
   *
   * Phase 2 (FSRS): the replay now runs `lib/srs/fsrs.ts#nextState` in TS —
   * fetch the item's full chronological attempt history, splice in the edited
   * result/score at the target attempt, replay FSRS sequentially (each row
   * using ITS OWN `created_at` as the review time, exactly like the old SQL
   * loop did for box/streak), then hand the RPC the final computed state to
   * write atomically. See `migrations/edu_study_fsrs_scheduler.sql`.
   */
  async overrideAttempt(
    input: OverrideAttemptInput,
  ): Promise<
    StudyResult<{ attempt: StudyAttemptRow; mastery: ItemMasteryRow }>
  > {
    try {
      const { data: targetRow, error: targetErr } = await EDU()
        .from("study_attempt")
        .select("id, item_type, item_id, created_at")
        .eq("id", input.attemptId)
        .is("deleted_at", null)
        .maybeSingle();
      if (targetErr) return fail("overrideAttempt", targetErr);
      if (!targetRow) return fail("overrideAttempt", "Attempt not found");

      const historyRes = await this.attemptsForItem({
        itemType: targetRow.item_type,
        itemId: targetRow.item_id,
      });
      if (historyRes.error) return fail("overrideAttempt", historyRes.error);

      const history = (historyRes.data ?? []).map((row) =>
        row.id === input.attemptId
          ? {
              ...row,
              result: input.result,
              score_value: input.scoreValue ?? row.score_value,
            }
          : row,
      );

      let prev: FsrsState | null = null;
      let streak = 0;
      let prevStreakBeforeLast = 0;
      let attemptCount = 0;
      let correctCount = 0;
      let lastResult: string | null = null;
      for (const row of history) {
        attemptCount += 1;
        if (!row.result) continue;
        const rating = mapResultToRating(
          row.result as "correct" | "partial" | "incorrect",
        );
        const reviewedAt = row.created_at ? new Date(row.created_at) : new Date();
        prevStreakBeforeLast = streak;
        prev = nextState(prev, rating, reviewedAt);
        if (row.result === "correct") {
          streak += 1;
          correctCount += 1;
        } else {
          streak = 0;
        }
        lastResult = row.result;
      }

      if (!prev) {
        return fail(
          "overrideAttempt",
          "Cannot override: item has no graded attempts",
        );
      }

      const now = new Date();
      const retrievabilityNow = fsrsRetrievability(prev, now);
      const struggleFlag =
        (lastResult !== "correct" && lastResult !== "partial") ||
        (prevStreakBeforeLast === 0 && lastResult !== "correct");

      const { data, error } = await supabase.rpc("study_override_attempt", {
        p_attempt_id: input.attemptId,
        p_result: input.result,
        ...(input.scoreValue != null
          ? { p_score_value: input.scoreValue }
          : {}),
        ...(input.score != null ? { p_score: input.score as never } : {}),
        p_difficulty: prev.difficulty,
        p_stability: prev.stability,
        p_due_at: prev.due,
        p_retrievability: retrievabilityNow,
        p_lapses: prev.lapses,
        p_streak: streak,
        p_attempt_count: attemptCount,
        p_correct_count: correctCount,
        p_struggle_flag: struggleFlag,
      });
      if (error) return fail("overrideAttempt", error);
      if (!isOverrideAttemptResult(data)) {
        return fail("overrideAttempt", "RPC returned an unexpected shape");
      }
      return {
        data: { attempt: data.attempt, mastery: data.mastery },
        error: null,
      };
    } catch (e) {
      return fail("overrideAttempt", e);
    }
  },

  // ─── MASTERY ──────────────────────────────────────────────────────────────
  /** The current user's mastery row for one item, or null if never studied. */
  async getMastery(item: ItemRef): Promise<StudyResult<ItemMasteryRow | null>> {
    try {
      const { data, error } = await EDU()
        .from("item_mastery")
        .select("*")
        .eq("item_type", item.itemType)
        .eq("item_id", item.itemId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) return fail("getMastery", error);
      return { data: (data ?? null) as ItemMasteryRow | null, error: null };
    } catch (e) {
      return fail("getMastery", e);
    }
  },

  /**
   * Mastery rows for many items of ONE item_type in a single round-trip. Items
   * with no mastery row are simply absent from the result (map by item_id).
   */
  async getMasteryBulk(
    items: ItemRef[],
  ): Promise<StudyResult<ItemMasteryRow[]>> {
    try {
      if (items.length === 0) return { data: [], error: null };
      const itemType = items[0].itemType;
      const itemIds = items.map((i) => i.itemId);
      const { data, error } = await EDU()
        .from("item_mastery")
        .select("*")
        .eq("item_type", itemType)
        .in("item_id", itemIds)
        .is("deleted_at", null);
      if (error) return fail("getMasteryBulk", error);
      return { data: (data ?? []) as ItemMasteryRow[], error: null };
    } catch (e) {
      return fail("getMasteryBulk", e);
    }
  },

  /**
   * All of the current user's mastery rows for one item_type (RLS-scoped), for
   * progress aggregation (mastery distribution, due count, struggling count).
   * Capped by `limit` — a learner with more than this many studied items is well
   * past where a client-side summary should move to an RPC.
   */
  async listMastery(
    itemType: string,
    limit = 2000,
  ): Promise<StudyResult<ItemMasteryRow[]>> {
    try {
      const { data, error } = await EDU()
        .from("item_mastery")
        .select("*")
        .eq("item_type", itemType)
        .is("deleted_at", null)
        .order("last_attempt_at", { ascending: false })
        .limit(limit);
      if (error) return fail("listMastery", error);
      return { data: (data ?? []) as ItemMasteryRow[], error: null };
    } catch (e) {
      return fail("listMastery", e);
    }
  },

  /**
   * The adaptive "what's due" query: the current user's mastery rows for one
   * item_type that are due now (`due_at <= now()`), soonest-first. Uses the
   * `idx_item_mastery_due` index.
   */
  async listDue(
    itemType: string,
    limit = 50,
  ): Promise<StudyResult<ItemMasteryRow[]>> {
    try {
      const { data, error } = await EDU()
        .from("item_mastery")
        .select("*")
        .eq("item_type", itemType)
        .is("deleted_at", null)
        .lte("due_at", new Date().toISOString())
        .order("due_at", { ascending: true })
        .limit(limit);
      if (error) return fail("listDue", error);
      return { data: (data ?? []) as ItemMasteryRow[], error: null };
    } catch (e) {
      return fail("listDue", e);
    }
  },

  /**
   * Phase 3 (weak-area drill) — worst-first candidate rows for one item_type:
   * every studied item (`attempt_count > 0`) that is EITHER flagged
   * `struggle_flag` OR has a low write-time `retrievability` snapshot. Capped
   * generously above the caller's real limit (`candidateLimit`) because the
   * snapshot doesn't account for FSRS decay since `last_review` — callers
   * should re-sort by `displayMasteryPct`/`currentRetrievability`
   * (`features/education/study/utils/masteryFsrs.ts`) client-side for the
   * true worst-first order, then slice to the UI limit.
   */
  async listWeakest(
    itemType: string,
    candidateLimit = 200,
  ): Promise<StudyResult<ItemMasteryRow[]>> {
    try {
      const { data, error } = await EDU()
        .from("item_mastery")
        .select("*")
        .eq("item_type", itemType)
        .is("deleted_at", null)
        .gt("attempt_count", 0)
        .or("struggle_flag.eq.true,retrievability.lt.0.7")
        .order("struggle_flag", { ascending: false })
        .order("retrievability", { ascending: true, nullsFirst: false })
        .limit(candidateLimit);
      if (error) return fail("listWeakest", error);
      return { data: (data ?? []) as ItemMasteryRow[], error: null };
    } catch (e) {
      return fail("listWeakest", e);
    }
  },

  /**
   * Phase 4 (AI tutor context) — this learner's most recent attempts on ONE
   * item, newest first. Feeds `fc_help_live`'s `card_history` variable (and
   * any future per-card coaching) with REAL prior-attempt signal instead of
   * the long-standing `[]` stub — small, capped, read-only.
   */
  async listAttemptsForItem(
    itemType: string,
    itemId: string,
    limit = 10,
  ): Promise<StudyResult<StudyAttemptRow[]>> {
    try {
      const { data, error } = await EDU()
        .from("study_attempt")
        .select("*")
        .eq("item_type", itemType)
        .eq("item_id", itemId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return fail("listAttemptsForItem", error);
      return { data: (data ?? []) as StudyAttemptRow[], error: null };
    } catch (e) {
      return fail("listAttemptsForItem", e);
    }
  },

  /**
   * Phase 3 (daily streak) — the current user's streak row. Read-only from
   * the client; `education.bump_study_streak()` (an AFTER INSERT trigger on
   * `study_session`) is the ONLY writer, so every study mode's session
   * creation counts toward the streak with zero per-surface wiring. `null`
   * data (no error) means the user has never started a session.
   */
  async getStreak(): Promise<StudyResult<StudyStreakRow | null>> {
    try {
      const { data, error } = await EDU()
        .from("study_streak")
        .select("*")
        .maybeSingle();
      if (error) return fail("getStreak", error);
      return { data: (data ?? null) as StudyStreakRow | null, error: null };
    } catch (e) {
      return fail("getStreak", e);
    }
  },

  /**
   * Phase 6 (cross-session analytics) — the current user's BROAD attempt
   * ledger for one item_type, oldest-first, optionally since a cutoff. Unlike
   * `attemptsForItem` (one item) this is cross-set: every fc_card the learner
   * has ever answered, in one round-trip, for client-side time-bucketing
   * (accuracy-over-time, weekly time studied via the paired session query).
   * Capped by `limit` for the same reason `listMastery` is — a heavier trend
   * query moves to an RPC/materialized view only once this outgrows a single
   * page load.
   */
  async listAttempts(
    itemType: string,
    filter: ListAttemptsFilter = {},
  ): Promise<StudyResult<StudyAttemptRow[]>> {
    try {
      let q = EDU()
        .from("study_attempt")
        .select("*")
        .eq("item_type", itemType)
        .is("deleted_at", null);
      if (filter.since) q = q.gte("created_at", filter.since);
      q = q.order("created_at", { ascending: true }).limit(filter.limit ?? 5000);
      const { data, error } = await q;
      if (error) return fail("listAttempts", error);
      return { data: (data ?? []) as StudyAttemptRow[], error: null };
    } catch (e) {
      return fail("listAttempts", e);
    }
  },

  // ─── GOALS (Phase 6 planner — real CRUD on study_goal) ───────────────────
  /**
   * Create a study goal. `study_goal` has no topic/item_type/set columns —
   * targeting rides in `metadata` (see `StudyGoalMetadata`) so the schema
   * never has to grow per study mode.
   */
  async createGoal(input: NewGoalInput): Promise<StudyResult<StudyGoalRow>> {
    try {
      const orgId = await ensureOrgId(input.orgId ?? null);
      const { data, error } = await EDU()
        .from("study_goal")
        .insert({
          organization_id: orgId,
          title: input.title,
          target_date: input.targetDate ?? null,
          status: input.status ?? "active",
          metadata: (input.metadata ?? {}) as never,
        })
        .select("*")
        .single();
      if (error) return fail("createGoal", error);
      return { data: data as StudyGoalRow, error: null };
    } catch (e) {
      return fail("createGoal", e);
    }
  },

  /** The current user's goals (RLS-scoped), soonest target date first (nulls last). */
  async listGoals(
    filter: ListGoalsFilter = {},
  ): Promise<StudyResult<StudyGoalRow[]>> {
    try {
      let q = EDU().from("study_goal").select("*").is("deleted_at", null);
      if (filter.status) q = q.eq("status", filter.status);
      q = q.order("target_date", { ascending: true, nullsFirst: false });
      const { data, error } = await q;
      if (error) return fail("listGoals", error);
      return { data: (data ?? []) as StudyGoalRow[], error: null };
    } catch (e) {
      return fail("listGoals", e);
    }
  },

  async updateGoal(
    id: string,
    patch: GoalPatch,
  ): Promise<StudyResult<StudyGoalRow>> {
    try {
      const { data, error } = await EDU()
        .from("study_goal")
        .update(patch as never)
        .eq("id", id)
        .select("*")
        .single();
      if (error) return fail("updateGoal", error);
      return { data: data as StudyGoalRow, error: null };
    } catch (e) {
      return fail("updateGoal", e);
    }
  },

  /** Soft-delete a goal (sets deleted_at). */
  async deleteGoal(id: string): Promise<StudyResult<{ id: string }>> {
    try {
      const { data, error } = await EDU()
        .from("study_goal")
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq("id", id)
        .select("id")
        .single();
      if (error) return fail("deleteGoal", error);
      return { data: { id: (data as { id: string }).id }, error: null };
    } catch (e) {
      return fail("deleteGoal", e);
    }
  },
};
