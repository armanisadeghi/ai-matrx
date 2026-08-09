"use client";

// features/education/study/analytics/useAnalyticsNarrative.ts
//
// Runs the Study Analytics Narrator agent over computed analytics and returns a
// coerced `NarrativeReport`, via the canonical `useHeadlessAgentJson`
// primitive (D126). Optional layer — the dashboard renders the raw numbers with
// or without it, so a slow/failed narration never blocks the data.
//
// React Compiler is on: no manual memo.

import { useHeadlessAgentJson } from "@/features/agents/hooks/useHeadlessAgentJson";
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
  const { run, isRunning, error } = useHeadlessAgentJson();

  async function narrate(
    analytics: StudyAnalytics,
    itemLabel = "cards",
  ): Promise<NarrativeReport> {
    return run<NarrativeReport>({
      agentId: STUDY_AGENTS.narrator,
      surfaceKey: "education-analytics-narrate",
      sourceFeature: "education-analytics",
      displayMode: "direct",
      variables: narrativeVariables(analytics, itemLabel),
      timeoutMs: EXTRACTION_TIMEOUT_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      failureMessages: {
        streamError: "The narrator agent failed",
        noJson: "Narrator produced no structured JSON",
        timeout: "Timed out waiting for the narrator agent",
      },
      coerce: coerceNarrative,
    });
  }

  return { narrate, isNarrating: isRunning, error };
}
