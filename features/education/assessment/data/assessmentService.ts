// features/education/assessment/data/assessmentService.ts
//
// Canonical ASSESSMENT content service: assessment / assessment_item /
// assessment_result in the `education` schema, plus assessment↔source edges via
// the association chokepoint. Reads/writes go direct through supabase-js
// (RLS-gated); edges go through `associationsService`. Never throws — every
// method returns `AsResult<T>`.
//
// Per-question grading writes the SHARED study spine (features/education/study),
// keyed item_type='assessment_item' — not here. This service owns content only.

"use client";

import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type {
  AsResult,
  AssessmentRow,
  AssessmentItemRow,
  AssessmentResultRow,
  AssessmentWithItems,
  NewAssessmentInput,
  NewAssessmentItemInput,
  AssessmentPatch,
  AssessmentItemPatch,
  NewResultInput,
  FinalizeResultInput,
  ListAssessmentsFilter,
} from "./types";

const EDU = () => supabase.schema("education");

/** Surface PostgREST/DB errors loudly (message + details + hint + code). */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const e = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    return (
      [e.message, e.details, e.hint && `hint: ${e.hint}`, e.code && `(${e.code})`]
        .filter(Boolean)
        .join(" — ") || "Unknown error"
    );
  }
  return "Unknown error";
}

function fail<T>(context: string, error: unknown): AsResult<T> {
  console.error(`[assessmentService] ${context}:`, error);
  return { data: null, error: `${context}: ${describeError(error)}` };
}

export const assessmentService = {
  // ─── ASSESSMENTS ──────────────────────────────────────────────────────────
  async createAssessment(
    input: NewAssessmentInput,
  ): Promise<AsResult<AssessmentRow>> {
    try {
      const orgId = await ensureOrgId(input.orgId ?? null);
      const { data, error } = await EDU()
        .from("assessment")
        .insert({
          organization_id: orgId,
          assessment_kind: input.assessmentKind,
          title: input.title,
          description: input.description ?? null,
          status: input.status ?? "draft",
          source_kind: input.sourceKind ?? null,
          source_id: input.sourceId ?? null,
          source_title: input.sourceTitle ?? null,
          topic: input.topic ?? null,
          exam_type: input.examType ?? null,
          depth: input.depth ?? null,
          time_limit_seconds: input.timeLimitSeconds ?? null,
          config: (input.config ?? {}) as never,
          trust: (input.trust ?? null) as never,
          metadata: (input.metadata ?? {}) as never,
        } as never)
        .select("*")
        .single();
      if (error) return fail("createAssessment", error);
      // Provenance is single-valued → captured by source_kind/source_id columns
      // (the study_media precedent), not a polymorphic association edge.
      return { data: data as AssessmentRow, error: null };
    } catch (e) {
      return fail("createAssessment", e);
    }
  },

  async updateAssessment(
    id: string,
    patch: AssessmentPatch,
  ): Promise<AsResult<AssessmentRow>> {
    try {
      const { data, error } = await EDU()
        .from("assessment")
        .update(patch as never)
        .eq("id", id)
        .select("*")
        .single();
      if (error) return fail("updateAssessment", error);
      return { data: data as AssessmentRow, error: null };
    } catch (e) {
      return fail("updateAssessment", e);
    }
  },

  /** Flip visibility (private → link/public) for sharing. */
  async updateVisibility(
    id: string,
    visibility: AssessmentRow["visibility"],
  ): Promise<AsResult<AssessmentRow>> {
    try {
      const { data, error } = await EDU()
        .from("assessment")
        .update({ visibility } as never)
        .eq("id", id)
        .select("*")
        .single();
      if (error) return fail("updateVisibility", error);
      return { data: data as AssessmentRow, error: null };
    } catch (e) {
      return fail("updateVisibility", e);
    }
  },

  async deleteAssessment(id: string): Promise<AsResult<{ id: string }>> {
    try {
      const { data, error } = await EDU()
        .from("assessment")
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq("id", id)
        .select("id")
        .single();
      if (error) return fail("deleteAssessment", error);
      return { data: { id: (data as { id: string }).id }, error: null };
    } catch (e) {
      return fail("deleteAssessment", e);
    }
  },

  async getAssessment(id: string): Promise<AsResult<AssessmentRow | null>> {
    try {
      const { data, error } = await EDU()
        .from("assessment")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) return fail("getAssessment", error);
      return { data: (data ?? null) as AssessmentRow | null, error: null };
    } catch (e) {
      return fail("getAssessment", e);
    }
  },

  /** One assessment + its ordered items (RLS-gated). null = not found/hidden. */
  async getAssessmentWithItems(
    id: string,
  ): Promise<AsResult<AssessmentWithItems | null>> {
    try {
      const { data: assessment, error: aErr } = await EDU()
        .from("assessment")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (aErr) return fail("getAssessmentWithItems", aErr);
      if (!assessment) return { data: null, error: null };
      const { data: items, error: iErr } = await EDU()
        .from("assessment_item")
        .select("*")
        .eq("assessment_id", id)
        .is("deleted_at", null)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (iErr) return fail("getAssessmentWithItems", iErr);
      return {
        data: {
          assessment: assessment as AssessmentRow,
          items: (items ?? []) as AssessmentItemRow[],
        },
        error: null,
      };
    } catch (e) {
      return fail("getAssessmentWithItems", e);
    }
  },

  /** The current user's assessments (RLS-scoped), newest-first. */
  async listAssessments(
    filter: ListAssessmentsFilter = {},
  ): Promise<AsResult<AssessmentRow[]>> {
    try {
      let q = EDU().from("assessment").select("*").is("deleted_at", null);
      if (filter.kind) q = q.eq("assessment_kind", filter.kind);
      if (filter.sourceKind) q = q.eq("source_kind", filter.sourceKind);
      if (filter.sourceId) q = q.eq("source_id", filter.sourceId);
      if (filter.status) q = q.eq("status", filter.status);
      q = q.order("updated_at", { ascending: false });
      if (filter.limit != null) q = q.limit(filter.limit);
      const { data, error } = await q;
      if (error) return fail("listAssessments", error);
      return { data: (data ?? []) as AssessmentRow[], error: null };
    } catch (e) {
      return fail("listAssessments", e);
    }
  },

  // ─── ITEMS ─────────────────────────────────────────────────────────────────
  /**
   * Insert questions for an assessment. `organization_id` is omitted — the
   * `_inherit_org` trigger copies it from the parent assessment. Positions are
   * assigned sequentially from `startPosition` when an item omits its own.
   */
  async addItems(
    assessmentId: string,
    items: NewAssessmentItemInput[],
    opts: { startPosition?: number } = {},
  ): Promise<AsResult<AssessmentItemRow[]>> {
    if (items.length === 0) return { data: [], error: null };
    try {
      const start = opts.startPosition ?? 0;
      const rows = items.map((it, i) => ({
        assessment_id: assessmentId,
        position: it.position ?? start + i,
        question_type: it.questionType,
        prompt: it.prompt,
        options: (it.options ?? null) as never,
        correct_answer: it.correctAnswer ?? null,
        acceptable_answers: (it.acceptableAnswers ?? null) as never,
        explanation: it.explanation ?? null,
        rubric: it.rubric ?? null,
        depth: it.depth ?? null,
        points: it.points ?? 1,
        topic: it.topic ?? null,
        trust: (it.trust ?? null) as never,
      }));
      const { data, error } = await EDU()
        .from("assessment_item")
        .insert(rows as never)
        .select("*");
      if (error) return fail("addItems", error);
      return { data: (data ?? []) as AssessmentItemRow[], error: null };
    } catch (e) {
      return fail("addItems", e);
    }
  },

  async updateItem(
    itemId: string,
    patch: AssessmentItemPatch,
  ): Promise<AsResult<AssessmentItemRow>> {
    try {
      const { data, error } = await EDU()
        .from("assessment_item")
        .update(patch as never)
        .eq("id", itemId)
        .select("*")
        .single();
      if (error) return fail("updateItem", error);
      return { data: data as AssessmentItemRow, error: null };
    } catch (e) {
      return fail("updateItem", e);
    }
  },

  async deleteItem(itemId: string): Promise<AsResult<{ id: string }>> {
    try {
      const { data, error } = await EDU()
        .from("assessment_item")
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq("id", itemId)
        .select("id")
        .single();
      if (error) return fail("deleteItem", error);
      return { data: { id: (data as { id: string }).id }, error: null };
    } catch (e) {
      return fail("deleteItem", e);
    }
  },

  /** Create assessment + insert its items in one call (the generation persist path). */
  async createWithItems(
    input: NewAssessmentInput,
    items: NewAssessmentItemInput[],
  ): Promise<AsResult<AssessmentWithItems>> {
    const created = await this.createAssessment(input);
    if (created.error || !created.data)
      return fail("createWithItems", created.error ?? "no assessment");
    const added = await this.addItems(created.data.id, items);
    if (added.error) return fail("createWithItems", added.error);
    return {
      data: { assessment: created.data, items: added.data ?? [] },
      error: null,
    };
  },

  /**
   * Duplicate an assessment (+ its items) into a NEW assessment owned by the
   * current user — the P7 "duplicate-to-edit" path for a view-only sharee.
   * Copies content + trust; resets provenance to the copied-from assessment.
   */
  async duplicate(id: string): Promise<AsResult<AssessmentRow>> {
    try {
      const src = await this.getAssessmentWithItems(id);
      if (src.error || !src.data)
        return fail("duplicate", src.error ?? "source not found");
      const { assessment: a, items } = src.data;
      const created = await this.createAssessment({
        assessmentKind: a.assessment_kind as NewAssessmentInput["assessmentKind"],
        title: `${a.title} (copy)`,
        description: a.description,
        status: "ready",
        sourceKind: a.source_kind as NewAssessmentInput["sourceKind"],
        sourceId: a.source_id,
        sourceTitle: a.source_title,
        topic: a.topic,
        examType: a.exam_type,
        depth: a.depth as NewAssessmentInput["depth"],
        timeLimitSeconds: a.time_limit_seconds,
        config: (a.config as NewAssessmentInput["config"]) ?? {},
        metadata: { question_count: items.length, duplicated_from: a.id },
      });
      if (created.error || !created.data)
        return fail("duplicate", created.error ?? "copy failed");
      if (items.length > 0) {
        await this.addItems(
          created.data.id,
          items.map((it) => ({
            questionType: it.question_type as NewAssessmentItemInput["questionType"],
            prompt: it.prompt,
            options: (it.options as string[] | null) ?? null,
            correctAnswer: it.correct_answer,
            acceptableAnswers: (it.acceptable_answers as string[] | null) ?? null,
            explanation: it.explanation,
            rubric: it.rubric,
            depth: it.depth as NewAssessmentItemInput["depth"],
            points: Number(it.points ?? 1),
            topic: it.topic,
            position: it.position,
          })),
        );
      }
      return { data: created.data, error: null };
    } catch (e) {
      return fail("duplicate", e);
    }
  },

  // ─── RESULTS (per-taking scored report + learning gain) ─────────────────────
  /** Open a result row when the learner starts a taking. */
  async createResult(
    input: NewResultInput,
  ): Promise<AsResult<AssessmentResultRow>> {
    try {
      const orgId = await ensureOrgId(input.orgId ?? null);
      const { data, error } = await EDU()
        .from("assessment_result")
        .insert({
          organization_id: orgId,
          assessment_id: input.assessmentId,
          session_id: input.sessionId ?? null,
          phase: input.phase ?? "standalone",
          gain_group_id: input.gainGroupId ?? null,
          topic: input.topic ?? null,
          source_kind: input.sourceKind ?? null,
          source_id: input.sourceId ?? null,
          status: "in_progress",
          total_count: input.totalCount,
          points_possible: input.pointsPossible ?? null,
          started_at: new Date().toISOString(),
        } as never)
        .select("*")
        .single();
      if (error) return fail("createResult", error);
      return { data: data as AssessmentResultRow, error: null };
    } catch (e) {
      return fail("createResult", e);
    }
  },

  /** Finalize a result with the scored breakdown (the results page reads this). */
  async finalizeResult(
    input: FinalizeResultInput,
  ): Promise<AsResult<AssessmentResultRow>> {
    try {
      const { data, error } = await EDU()
        .from("assessment_result")
        .update({
          status: input.status ?? "completed",
          correct_count: input.correctCount,
          partial_count: input.partialCount,
          total_count: input.totalCount,
          score_value: input.scoreValue,
          points_earned: input.pointsEarned,
          points_possible: input.pointsPossible,
          duration_seconds: input.durationSeconds ?? null,
          detail: input.detail as never,
          completed_at: new Date().toISOString(),
        } as never)
        .eq("id", input.resultId)
        .select("*")
        .single();
      if (error) return fail("finalizeResult", error);
      return { data: data as AssessmentResultRow, error: null };
    } catch (e) {
      return fail("finalizeResult", e);
    }
  },

  async getResult(id: string): Promise<AsResult<AssessmentResultRow | null>> {
    try {
      const { data, error } = await EDU()
        .from("assessment_result")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) return fail("getResult", error);
      return { data: (data ?? null) as AssessmentResultRow | null, error: null };
    } catch (e) {
      return fail("getResult", e);
    }
  },

  /** The current user's results for one assessment, newest-first. */
  async listResults(
    assessmentId: string,
    limit = 50,
  ): Promise<AsResult<AssessmentResultRow[]>> {
    try {
      const { data, error } = await EDU()
        .from("assessment_result")
        .select("*")
        .eq("assessment_id", assessmentId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return fail("listResults", error);
      return { data: (data ?? []) as AssessmentResultRow[], error: null };
    } catch (e) {
      return fail("listResults", e);
    }
  },

  /**
   * LEARNING-GAIN read (published contract for P5). The current user's
   * baseline/post results, newest-first — callers pair them by gain_group_id or
   * by (topic/source). Capped; a heavier trend query moves to an RPC later.
   */
  async listGainResults(
    limit = 500,
  ): Promise<AsResult<AssessmentResultRow[]>> {
    try {
      const { data, error } = await EDU()
        .from("assessment_result")
        .select("*")
        .in("phase", ["baseline", "post"])
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return fail("listGainResults", error);
      return { data: (data ?? []) as AssessmentResultRow[], error: null };
    } catch (e) {
      return fail("listGainResults", e);
    }
  },
};
