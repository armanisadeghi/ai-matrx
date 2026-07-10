// features/education/study/service/planService.ts
//
// The AI Study Planner persistence service (P5). CRUD on the plan spine
// (education.study_plan / study_plan_day / study_plan_block) plus the
// generator-agnostic `savePlan(draft)` / `regeneratePlan(id, draft)` that turn
// a `PlanDraft` (from the heuristic builder OR the planner agent) into rows.
// Reads go direct via supabase-js (RLS owner-scoped). Never throws — every
// method returns `StudyResult<T>`.
//
// Org is omitted on insert: the `_stamp_org_default` trigger fills the creator's
// personal org, exactly as studyService.createSession relies on.

"use client";

import { supabase } from "@/utils/supabase/client";
import type { StudyResult } from "../types";
import type {
  PlanDraft,
  PlanWithDays,
  StudyPlanRow,
  StudyPlanDayRow,
  StudyPlanBlockRow,
} from "../planner/types";
import { fail } from "./serviceError";

const EDU = () => supabase.schema("education");

/** Map a draft plan's top-level fields to the study_plan insert/update payload. */
function planPayload(draft: PlanDraft): Record<string, unknown> {
  return {
    title: draft.title,
    start_date: draft.startDate,
    end_date: draft.endDate,
    daily_minutes: draft.dailyMinutes,
    daily_item_cap: draft.dailyItemCap ?? null,
    rest_days: draft.restDays,
    goal_id: draft.goalId ?? null,
    generated_by: draft.generatedBy,
    generator_agent_id: draft.generatorAgentId ?? null,
    rationale: draft.rationale ?? null,
    config: draft.config ?? {},
    last_planned_at: new Date().toISOString(),
  };
}

/**
 * Insert a draft's day + block rows under an existing plan id. Days go in one
 * batch (to resolve day ids), then all blocks in one batch with day_id wired.
 */
async function insertDraftChildren(
  planId: string,
  draft: PlanDraft,
): Promise<StudyResult<null>> {
  if (draft.days.length === 0) return { data: null, error: null };

  const dayRows = draft.days.map((d) => ({
    plan_id: planId,
    day_date: d.dayDate,
    target_minutes: d.targetMinutes,
    is_rest_day: d.isRestDay,
    status: d.isRestDay ? "rest" : "pending",
    rationale: d.rationale ?? null,
  }));

  const { data: insertedDays, error: dayErr } = await EDU()
    .from("study_plan_day")
    .insert(dayRows as never)
    .select("id, day_date");
  if (dayErr) return fail("savePlan(days)", dayErr);

  const dayIdByDate = new Map<string, string>();
  for (const row of (insertedDays ?? []) as {
    id: string;
    day_date: string;
  }[]) {
    dayIdByDate.set(row.day_date, row.id);
  }

  const blockRows = draft.days.flatMap((d) =>
    d.blocks.map((b) => ({
      plan_id: planId,
      day_id: dayIdByDate.get(d.dayDate) ?? null,
      day_date: b.dayDate,
      target_kind: b.targetKind,
      item_type: b.itemType ?? null,
      target_ref: b.targetRef ?? {},
      label: b.label,
      estimated_minutes: b.estimatedMinutes,
      estimated_items: b.estimatedItems ?? null,
      method: b.method ?? null,
      ordering: b.ordering,
      status: "pending",
      rationale: b.rationale ?? null,
    })),
  );

  if (blockRows.length > 0) {
    const { error: blockErr } = await EDU()
      .from("study_plan_block")
      .insert(blockRows as never);
    if (blockErr) return fail("savePlan(blocks)", blockErr);
  }
  return { data: null, error: null };
}

export const planService = {
  /** The current user's plans (RLS-scoped), newest-first, optionally by status. */
  async listPlans(status?: string): Promise<StudyResult<StudyPlanRow[]>> {
    try {
      let q = EDU().from("study_plan").select("*").is("deleted_at", null);
      if (status) q = q.eq("status", status);
      q = q.order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) return fail("listPlans", error);
      return { data: (data ?? []) as StudyPlanRow[], error: null };
    } catch (e) {
      return fail("listPlans", e);
    }
  },

  /** The most recent active plan, hydrated with its days + ordered blocks. */
  async getActivePlan(): Promise<StudyResult<PlanWithDays | null>> {
    const listRes = await this.listPlans("active");
    if (listRes.error) return fail("getActivePlan", listRes.error);
    const plan = (listRes.data ?? [])[0];
    if (!plan) return { data: null, error: null };
    return this.getPlan(plan.id);
  },

  /**
   * The active plan's gentle daily review cap (anti-burnout), or null when there
   * is no active plan / no cap set. A lightweight single-column read so the due
   * queue (`useDueReview`) can honor the SAME cap the planner uses — the two
   * anti-burnout limits must not drift independently. `undefined`-safe: any read
   * error resolves to null (uncapped) rather than throwing into the study loop.
   */
  async getActiveDailyItemCap(): Promise<number | null> {
    try {
      const { data, error } = await EDU()
        .from("study_plan")
        .select("daily_item_cap")
        .eq("status", "active")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      const cap = (data as { daily_item_cap: number | null }).daily_item_cap;
      return typeof cap === "number" && cap > 0 ? cap : null;
    } catch {
      return null;
    }
  },

  /** One plan hydrated with its days + ordered blocks. */
  async getPlan(planId: string): Promise<StudyResult<PlanWithDays | null>> {
    try {
      const { data: plan, error: pErr } = await EDU()
        .from("study_plan")
        .select("*")
        .eq("id", planId)
        .is("deleted_at", null)
        .maybeSingle();
      if (pErr) return fail("getPlan", pErr);
      if (!plan) return { data: null, error: null };

      const [daysRes, blocksRes] = await Promise.all([
        EDU()
          .from("study_plan_day")
          .select("*")
          .eq("plan_id", planId)
          .is("deleted_at", null)
          .order("day_date", { ascending: true }),
        EDU()
          .from("study_plan_block")
          .select("*")
          .eq("plan_id", planId)
          .is("deleted_at", null)
          .order("day_date", { ascending: true })
          .order("ordering", { ascending: true }),
      ]);
      if (daysRes.error) return fail("getPlan(days)", daysRes.error);
      if (blocksRes.error) return fail("getPlan(blocks)", blocksRes.error);

      const blocksByDay = new Map<string, StudyPlanBlockRow[]>();
      for (const b of (blocksRes.data ?? []) as StudyPlanBlockRow[]) {
        const key = b.day_id ?? b.day_date;
        const arr = blocksByDay.get(key) ?? [];
        arr.push(b);
        blocksByDay.set(key, arr);
      }
      const days = ((daysRes.data ?? []) as StudyPlanDayRow[]).map((day) => ({
        day,
        blocks: blocksByDay.get(day.id) ?? blocksByDay.get(day.day_date) ?? [],
      }));

      return { data: { plan: plan as StudyPlanRow, days }, error: null };
    } catch (e) {
      return fail("getPlan", e);
    }
  },

  /** Persist a fresh plan (plan row + all days + blocks). Returns the plan id. */
  async savePlan(draft: PlanDraft): Promise<StudyResult<{ id: string }>> {
    try {
      const { data: plan, error } = await EDU()
        .from("study_plan")
        .insert(planPayload(draft) as never)
        .select("id")
        .single();
      if (error) return fail("savePlan", error);
      const planId = (plan as { id: string }).id;
      const childRes = await insertDraftChildren(planId, draft);
      if (childRes.error) return { data: null, error: childRes.error };
      return { data: { id: planId }, error: null };
    } catch (e) {
      return fail("savePlan", e);
    }
  },

  /**
   * Adaptive re-plan: rewrite an existing plan's days + blocks in place (the
   * plan keeps its id, so the surface visibly re-plans). Old child rows are
   * hard-deleted (they're cheap, regenerable, and versioned by trigger).
   */
  async regeneratePlan(
    planId: string,
    draft: PlanDraft,
  ): Promise<StudyResult<{ id: string }>> {
    try {
      // Blocks first (they FK day rows), then days.
      const delBlocks = await EDU()
        .from("study_plan_block")
        .delete()
        .eq("plan_id", planId);
      if (delBlocks.error) return fail("regeneratePlan(delBlocks)", delBlocks.error);
      const delDays = await EDU()
        .from("study_plan_day")
        .delete()
        .eq("plan_id", planId);
      if (delDays.error) return fail("regeneratePlan(delDays)", delDays.error);

      const { error: updErr } = await EDU()
        .from("study_plan")
        .update(planPayload(draft) as never)
        .eq("id", planId);
      if (updErr) return fail("regeneratePlan(update)", updErr);

      const childRes = await insertDraftChildren(planId, draft);
      if (childRes.error) return { data: null, error: childRes.error };
      return { data: { id: planId }, error: null };
    } catch (e) {
      return fail("regeneratePlan", e);
    }
  },

  /** Patch a plan's status ('active' | 'completed' | 'archived' | 'superseded'). */
  async updatePlanStatus(
    planId: string,
    status: string,
  ): Promise<StudyResult<{ id: string }>> {
    try {
      const { data, error } = await EDU()
        .from("study_plan")
        .update({ status } as never)
        .eq("id", planId)
        .select("id")
        .single();
      if (error) return fail("updatePlanStatus", error);
      return { data: { id: (data as { id: string }).id }, error: null };
    } catch (e) {
      return fail("updatePlanStatus", e);
    }
  },

  /** Mark a block done/skipped/pending — powers the plan-day checklist. */
  async updateBlockStatus(
    blockId: string,
    status: "pending" | "done" | "skipped",
  ): Promise<StudyResult<StudyPlanBlockRow>> {
    try {
      const { data, error } = await EDU()
        .from("study_plan_block")
        .update({ status } as never)
        .eq("id", blockId)
        .select("*")
        .single();
      if (error) return fail("updateBlockStatus", error);
      return { data: data as StudyPlanBlockRow, error: null };
    } catch (e) {
      return fail("updateBlockStatus", e);
    }
  },

  /** Soft-delete a plan (children cascade-delete on hard delete; here we hide it). */
  async deletePlan(planId: string): Promise<StudyResult<{ id: string }>> {
    try {
      const { data, error } = await EDU()
        .from("study_plan")
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq("id", planId)
        .select("id")
        .single();
      if (error) return fail("deletePlan", error);
      return { data: { id: (data as { id: string }).id }, error: null };
    } catch (e) {
      return fail("deletePlan", e);
    }
  },
};
