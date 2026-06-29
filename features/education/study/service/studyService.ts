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
} from "../types";

const EDU = () => supabase.schema("education");

function fail<T>(context: string, error: unknown): StudyResult<T> {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
  console.error(`[studyService] ${context}:`, error);
  return { data: null, error: `${context}: ${message}` };
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
    try {
      const { data, error } = await EDU()
        .from("study_session")
        .insert({
          ...(input.orgId ? { organization_id: input.orgId } : {}),
          mode: input.mode,
          source_kind: input.sourceKind ?? null,
          source_set_id: input.sourceSetId ?? null,
          source_query: (input.sourceQuery ?? null) as never,
          settings: (input.settings ?? {}) as never,
          ...(input.status ? { status: input.status } : {}),
          ...(input.visibility ? { visibility: input.visibility } : {}),
          metadata: (input.metadata ?? {}) as never,
        } as never)
        .select("*")
        .single();
      if (error) return fail("createSession", error);
      return { data: data as StudySessionRow, error: null };
    } catch (e) {
      return fail("createSession", e);
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
