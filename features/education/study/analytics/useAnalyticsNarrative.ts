"use client";

// features/education/study/analytics/useAnalyticsNarrative.ts
//
// Runs the Study Analytics Narrator agent over computed analytics and returns a
// coerced `NarrativeReport`, via the canonical `useLiveAgentRun` primitive. The
// reading STREAMS live inside `NarrativeCard` — the card IS this run's
// destination, and this narration AUTO-RUNS on page load, so floating it
// (THE FLOATING LAW's default) would throw a window over the dashboard the
// user came to read, every visit. The earned inline exception; the card bounds
// and scrolls the stream. Optional layer — the dashboard renders the raw
// numbers with or without it, so a slow/failed narration never blocks the data.
//
// React Compiler is on: no manual memo.

import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import { studyService } from "../service/studyService";
import { STUDY_MANDATES } from "../planner/mandates";
import type { StudyAnalytics } from "./computeAnalytics";
import {
  coerceNarrative,
  narrativeFingerprint,
  narrativeVariables,
  type NarrativeReport,
} from "./narrative";

const EXTRACTION_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 250;

export interface NarrateOptions {
  itemLabel?: string;
  /**
   * The learner's most recent `study_session` — where the reading is stored
   * (D151). Without it the narration is transient and every visit re-pays for
   * a ~120s run whose result dies on navigate.
   */
  sessionId?: string | null;
}

export interface AnalyticsNarrativeResult {
  narrate: (
    analytics: StudyAnalytics,
    options?: NarrateOptions,
  ) => Promise<NarrativeReport>;
  isNarrating: boolean;
  error: string | null;
  /** Live handle — render it in the card, never a "Reading your progress…" line. */
  conversationId: string | null;
}

export function useAnalyticsNarrative(): AnalyticsNarrativeResult {
  const { run, isRunning, error, conversationId } = useLiveAgentRun();

  async function narrate(
    analytics: StudyAnalytics,
    options: NarrateOptions = {},
  ): Promise<NarrativeReport> {
    const sessionId = options.sessionId ?? null;
    const fingerprint = narrativeFingerprint(analytics);
    return run<NarrativeReport>({
      mandateKey: STUDY_MANDATES.narrator,
      surfaceKey: "education-analytics-narrate",
      sourceFeature: "education-analytics",
      variables: narrativeVariables(analytics, options.itemLabel ?? "cards"),
      timeoutMs: EXTRACTION_TIMEOUT_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      failureMessages: {
        streamError: "The narrator agent failed",
        noJson: "Narrator produced no structured JSON",
        timeout: "Timed out waiting for the narrator agent",
      },
      coerce: coerceNarrative,
      // 🚨 D151 — this is the most expensive auto-fired run in the product: a
      // ~120s narration triggered by a mount effect. Stored with the
      // fingerprint of the numbers it describes, so the next visit reads it
      // back and only re-pays once the learner has actually studied more.
      ...(sessionId
        ? {
            onResult: async (runResult) => {
              let report: NarrativeReport;
              try {
                report = coerceNarrative(runResult.data);
              } catch {
                return; // nothing usable — nothing to store
              }
              const saved = await studyService.appendSessionArtifact(sessionId, {
                kind: "progressNarrative",
                entry: {
                  report: report as unknown,
                  fingerprint,
                  at: new Date().toISOString(),
                },
              });
              if (saved.error) {
                console.error(
                  "[study.narrate] reading generated but NOT saved:",
                  saved.error,
                );
              }
            },
          }
        : {}),
    });
  }

  return { narrate, isNarrating: isRunning, error, conversationId };
}
