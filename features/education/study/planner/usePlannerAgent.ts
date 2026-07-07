"use client";

// features/education/study/planner/usePlannerAgent.ts
//
// The "run the Study Planner agent → get a PlanDraft back" hook. Mirrors the
// production pattern in features/flashcards/data/useGenerateCards.ts
// (launchAgentExecution + waitForExtraction): dispatch a direct auto-running
// agent launch with JSON extraction on, poll the active-requests slice until
// extraction finalizes, then coerce the object into a `PlanDraft`.
//
// Persisting the draft (planService.savePlan / regeneratePlan) is the caller's
// job — this hook only owns the agent round-trip, so the same primitive serves
// first-generation and adaptive re-planning.
//
// React Compiler is on: no manual memo.

import { useState } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestError,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { RootState } from "@/lib/redux/store";
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
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function waitForExtraction(
    requestId: string,
    input: PlanInput,
    summary: PlanSummary,
  ): Promise<PlanDraft> {
    const start = Date.now();
    while (Date.now() - start < EXTRACTION_TIMEOUT_MS) {
      const state = store.getState() as RootState;
      if (selectJsonExtractionComplete(requestId)(state)) {
        const snapshot = selectFirstExtractedObject(requestId)(state);
        if (!snapshot) {
          throw new Error("Planner finished but produced no structured JSON");
        }
        return coercePlanDraft(snapshot.value, input, summary);
      }
      const status = selectRequestStatus(requestId)(state);
      if (status === "error") {
        const reqError = selectRequestError(requestId)(state);
        throw new Error(
          reqError?.user_message ??
            reqError?.message ??
            "The planner agent failed before returning a plan",
        );
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("Timed out waiting for the planner agent to respond");
  }

  async function generate(
    input: PlanInput,
    summary: PlanSummary,
  ): Promise<PlanDraft> {
    setIsGenerating(true);
    setError(null);
    try {
      const itemType = input.itemType ?? "fc_card";
      const { requestId } = await dispatch(
        launchAgentExecution({
          surfaceKey: "education-planner-generate",
          agentId: STUDY_AGENTS.planner,
          sourceFeature: "education-planner",
          jsonExtraction: { enabled: true },
          runtime: {
            variables: {
              goal_title: input.title,
              start_date: input.startDate,
              exam_date: input.examDate,
              daily_minutes: String(input.dailyMinutes),
              rest_days: restDaysToNames(input.restDays),
              study_snapshot: buildStudySnapshot(summary, itemType),
            },
          },
          config: { autoRun: true, displayMode: "direct" },
        }),
      ).unwrap();

      if (!requestId) {
        throw new Error("Planner launch did not return a request id");
      }
      return await waitForExtraction(requestId, input, summary);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to generate a plan";
      setError(message);
      throw e instanceof Error ? e : new Error(message);
    } finally {
      setIsGenerating(false);
    }
  }

  return { generate, isGenerating, error };
}
