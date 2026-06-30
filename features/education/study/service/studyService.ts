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
import type {
  StudyResult,
  StudySessionRow,
  StudyAttemptRow,
  ItemMasteryRow,
  ItemRef,
  NewSessionInput,
  RecordAttemptInput,
  SessionPatch,
  ListSessionsFilter,
  SessionWithAttempts,
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
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
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

function isRecordAttemptResult(value: unknown): value is RecordAttemptRpcResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { attempt_id?: unknown }).attempt_id === "string" &&
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
  async createSession(input: NewSessionInput): Promise<StudyResult<StudySessionRow>> {
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
      let q = EDU()
        .from("study_session")
        .select("*")
        .is("deleted_at", null);
      if (filter.setId) q = q.eq("source_set_id", filter.setId);
      if (filter.mode) q = q.eq("mode", filter.mode);
      if (filter.status) q = q.eq("status", filter.status);
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

  /** One session + its ordered attempt ledger (RLS-gated). null session = not found/hidden. */
  async getSession(sessionId: string): Promise<StudyResult<SessionWithAttempts | null>> {
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
  async updateSession(id: string, patch: SessionPatch): Promise<StudyResult<StudySessionRow>> {
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
   */
  async recordAttempt(
    input: RecordAttemptInput,
  ): Promise<StudyResult<{ attemptId: string; mastery: ItemMasteryRow }>> {
    try {
      const { data, error } = await supabase.rpc("study_record_attempt", {
        p_item_type: input.itemType,
        p_item_id: input.itemId,
        ...(input.sessionId != null ? { p_session_id: input.sessionId } : {}),
        ...(input.method != null ? { p_method: input.method } : {}),
        ...(input.result != null ? { p_result: input.result } : {}),
        ...(input.score != null ? { p_score: input.score as never } : {}),
        ...(input.scoreValue != null ? { p_score_value: input.scoreValue } : {}),
        ...(input.responseKind != null ? { p_response_kind: input.responseKind } : {}),
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
  async attemptsForItem(item: ItemRef): Promise<StudyResult<StudyAttemptRow[]>> {
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
  async getMasteryBulk(items: ItemRef[]): Promise<StudyResult<ItemMasteryRow[]>> {
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
   * The adaptive "what's due" query: the current user's mastery rows for one
   * item_type that are due now (`due_at <= now()`), soonest-first. Uses the
   * `idx_item_mastery_due` index.
   */
  async listDue(itemType: string, limit = 50): Promise<StudyResult<ItemMasteryRow[]>> {
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
};
