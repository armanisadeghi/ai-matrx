"use client";

// features/education/study/analytics/useAnalyticsNarrative.ts
//
// Runs the Study Analytics Narrator agent over computed analytics and returns a
// coerced `NarrativeReport`. Same launch/extract pattern as usePlannerAgent /
// useGenerateCards. Optional layer — the dashboard renders the raw numbers with
// or without it, so a slow/failed narration never blocks the data.
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
import { STUDY_AGENTS } from "../planner/agents";
import type { StudyAnalytics } from "./computeAnalytics";
import {
  coerceNarrative,
  narrativeVariables,
  type NarrativeReport,
} from "./narrative";

const EXTRACTION_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 250;

export interface AnalyticsNarrativeResult {
  narrate: (
    analytics: StudyAnalytics,
    itemLabel?: string,
  ) => Promise<NarrativeReport>;
  isNarrating: boolean;
  error: string | null;
}

export function useAnalyticsNarrative(): AnalyticsNarrativeResult {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [isNarrating, setIsNarrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function waitForExtraction(requestId: string): Promise<NarrativeReport> {
    const start = Date.now();
    while (Date.now() - start < EXTRACTION_TIMEOUT_MS) {
      const state = store.getState() as RootState;
      if (selectJsonExtractionComplete(requestId)(state)) {
        const snapshot = selectFirstExtractedObject(requestId)(state);
        if (!snapshot) throw new Error("Narrator produced no structured JSON");
        return coerceNarrative(snapshot.value);
      }
      const status = selectRequestStatus(requestId)(state);
      if (status === "error") {
        const reqError = selectRequestError(requestId)(state);
        throw new Error(
          reqError?.user_message ??
            reqError?.message ??
            "The narrator agent failed",
        );
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("Timed out waiting for the narrator agent");
  }

  async function narrate(
    analytics: StudyAnalytics,
    itemLabel = "cards",
  ): Promise<NarrativeReport> {
    setIsNarrating(true);
    setError(null);
    try {
      const { requestId } = await dispatch(
        launchAgentExecution({
          surfaceKey: "education-analytics-narrate",
          agentId: STUDY_AGENTS.narrator,
          sourceFeature: "education-analytics",
          jsonExtraction: { enabled: true },
          runtime: { variables: narrativeVariables(analytics, itemLabel) },
          config: { autoRun: true, displayMode: "direct" },
        }),
      ).unwrap();
      if (!requestId) throw new Error("Narrator launch returned no request id");
      return await waitForExtraction(requestId);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to narrate";
      setError(message);
      throw e instanceof Error ? e : new Error(message);
    } finally {
      setIsNarrating(false);
    }
  }

  return { narrate, isNarrating, error };
}
