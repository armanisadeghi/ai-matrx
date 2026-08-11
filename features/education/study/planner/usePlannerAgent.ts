"use client";

// features/education/study/planner/usePlannerAgent.ts
//
// The "run the Study Planner agent → get a PlanDraft back" hook, built on the
// canonical `useFloatingAgentRun` primitive — the plan STREAMS into the
// floating LiveRunWindow while it is written (THE FLOATING LAW: never a
// spinner while AI works). This hook only owns the planner variables and the
// `PlanDraft` coercion.
//
// Persisting the draft (planService.savePlan / regeneratePlan) is the caller's
// job — this hook only owns the agent round-trip, so the same primitive serves
// first-generation and adaptive re-planning.
//
// React Compiler is on: no manual memo.

import { useFloatingAgentRun } from "@/features/agents/hooks/useFloatingAgentRun";
import { STUDY_AGENTS, restDaysToNames } from "./agents";
import { buildStudySnapshot, coercePlanDraft } from "./coercePlan";
import type { PlanDraft, PlanInput } from "./types";
import type { PlanSummary } from "./buildPlan";

const EXTRACTION_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 250;

export interface PlannerAgentResult {
  generate: (input: PlanInput, summary: PlanSummary) => Promise<PlanDraft>;
  isGenerating: boolean;
  error: string | null;
}

export function usePlannerAgent(): PlannerAgentResult {
  const { run, isRunning, error } = useFloatingAgentRun();

  async function generate(
    input: PlanInput,
    summary: PlanSummary,
  ): Promise<PlanDraft> {
    const itemType = input.itemType ?? "fc_card";
    return run<PlanDraft>({
      agentId: STUDY_AGENTS.planner,
      label: "Building your study plan",
      surfaceKey: "education-planner-generate",
      sourceFeature: "education-planner",
      variables: {
        goal_title: input.title,
        start_date: input.startDate,
        exam_date: input.examDate,
        daily_minutes: String(input.dailyMinutes),
        rest_days: restDaysToNames(input.restDays),
        study_snapshot: buildStudySnapshot(summary, itemType),
      },
      timeoutMs: EXTRACTION_TIMEOUT_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      failureMessages: {
        streamError: "The planner agent failed before returning a plan",
        noJson: "Planner finished but produced no structured JSON",
        timeout: "Timed out waiting for the planner agent to respond",
      },
      coerce: (value) => coercePlanDraft(value, input, summary),
    });
  }

  return { generate, isGenerating: isRunning, error };
}
