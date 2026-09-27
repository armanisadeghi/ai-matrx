"use client";

// features/education/study/analytics/components/StudyAnalyticsDashboard.tsx
//
// The SELF progress dashboard (P5) at /education/progress — a thin data wrapper
// over the shared, presentation-only <StudyAnalyticsView>. It owns the CURRENT
// user's data path (useStudyAnalytics over the RLS-scoped spine + the AI
// narrator + the learning-gain fetch) and hands the folded result to the view.
// The guardian dashboard (features/education/family/StudentProgressView) is the
// second consumer of the same view, over a linked student's spine — so the
// surface never forks.
//
// React Compiler is on: no manual memo.

import { useEffect, useRef, useState } from "react";
import { useStudyAnalytics } from "../useStudyAnalytics";
import { useAnalyticsNarrative } from "../useAnalyticsNarrative";
import { studyService } from "../../service/studyService";
import { narrativeFingerprint, readStoredNarrative } from "../narrative";
import { learningGainService } from "../../learning-gain/learningGainService";
import type { LearningGainReport } from "../../learning-gain/types";
import type { NarrativeReport } from "../narrative";
import { NarrativeCard } from "./NarrativeCard";
import { StudyAnalyticsView } from "./StudyAnalyticsView";
import type { StudyAnalytics } from "../computeAnalytics";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationProgressScope } from "@/features/surfaces/manifests/education-progress.manifest";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildProgressOverviewXml } from "../progressContextBundle";
import { useDeclaredSurfaceMandates } from "@/features/surfaces/runtime/surface-mandates";
import { STUDY_MANDATES } from "../../planner/mandates";
import type { StudyWeekSeries } from "../../components/StudyTrends";

const SURFACE_NAME = "matrx-user/education-progress";

export function StudyAnalyticsDashboard({
  backHref,
}: {
  backHref?: string;
}) {
  const { analytics, mastery, latestSession, readingSession, loading, error } =
    useStudyAnalytics();
  const narrator = useAnalyticsNarrative();
  // The page's one fixed AI job, in the top Agents menu (disclosure law —
  // nothing visible is added to the page for it).
  useDeclaredSurfaceMandates([
    {
      mandateKey: STUDY_MANDATES.narrator,
      does: "Writes the reading of your progress and the next steps",
      surfaceName: SURFACE_NAME,
    },
  ]);
  // The narrator is filed under one organization; with none selected the run
  // is refused before it starts. Wait for one instead of auto-firing a run
  // that can only fail (and toast "Choose a workspace") on every visit.
  const { organizationState } = useOrganizationRequired();
  const orgReady = organizationState === "ready";
  const [report, setReport] = useState<NarrativeReport | null>(null);
  const [gain, setGain] = useState<LearningGainReport | null>(null);
  const [weekly, setWeekly] = useState<StudyWeekSeries[] | null>(null);
  const narratedRef = useRef(false);
  const sessionId = latestSession?.id ?? null;

  // D151 — the reading this learner already paid for, stored on their most
  // recent session with the fingerprint of the numbers it describes.
  const stored = readingSession
    ? studyService.readSessionJournal(readingSession).progressNarrative
    : undefined;
  const storedReport = stored ? readStoredNarrative(stored.report) : null;
  const storedIsCurrent =
    storedReport != null &&
    analytics != null &&
    stored?.fingerprint === narrativeFingerprint(analytics);
  const shownReport = report ?? (storedIsCurrent ? storedReport : null);

  // Read at trigger time, never from stale closure state.
  const buildScope = () =>
    createEducationProgressScope({
      view: "dashboard",
      analytics_loading: loading,
      analytics_error: error ?? undefined,
      ...(loading || !analytics
        ? {}
        : {
            progress_overview: buildProgressOverviewXml({
              analytics,
              narrative: shownReport,
              gain,
              weekly,
            }),
            analytics_has_data: analytics.hasData,
            overall_stats: analytics.overall,
            mode_stats: analytics.byMode,
            weak_topics: analytics.weakTopics,
            total_minutes: analytics.totalMinutes,
            session_count: analytics.sessions,
            current_streak: analytics.currentStreak,
            accuracy_trend: analytics.trend ?? undefined,
            gain_teaser_available: Boolean(gain && gain.pairs.length > 0),
            // The dashboard shows the learning-gain teaser, so the agent sees
            // the same report the teaser summarizes.
            ...(gain && gain.pairs.length > 0
              ? {
                  gain_pairs: gain.pairs,
                  gain_overall_delta: gain.overallDelta ?? undefined,
                  gain_overall_normalized: gain.overallNormalizedGain ?? undefined,
                  gain_is_seed: gain.contractPending || gain.isSeed,
                }
              : {}),
          }),
      narrative_loading: narrator.isNarrating,
      narrative_error: narrator.error ?? undefined,
      ...(shownReport
        ? {
            narrative_headline: shownReport.headline,
            narrative_insights: shownReport.insights,
            narrative_recommendations: shownReport.recommendations,
          }
        : {}),
    });

  const runNarration = async (a: StudyAnalytics) => {
    try {
      const r = await narrator.narrate(a, { sessionId });
      setReport(r);
    } catch {
      /* narration is optional chrome — numbers stand on their own */
    }
  };

  // Auto-narrate once when meaningful data is present — and ONLY when there
  // isn't already a reading for exactly these numbers. This used to re-pay for
  // a ~120s narration on every single visit to the page (D151).
  useEffect(() => {
    if (
      analytics &&
      analytics.hasData &&
      analytics.overall.studied >= 3 &&
      orgReady &&
      !narratedRef.current &&
      !storedIsCurrent
    ) {
      narratedRef.current = true;
      void runNarration(analytics);
    }
  }, [analytics, storedIsCurrent, orgReady]);

  useEffect(() => {
    let cancelled = false;
    void learningGainService.getReport().then((res) => {
      if (!cancelled) setGain(res.data ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={buildScope}>
      <NonEditableContextMenu
        sourceFeature="education-analytics"
        surfaceName={SURFACE_NAME}
        menuVersion={1}
        getApplicationScope={buildScope}
        contentSource={{ type: "raw", title: "Your progress", readOnly: true }}
      >
      <StudyAnalyticsView
        analytics={analytics}
        mastery={mastery}
        gain={gain}
        loading={loading}
        error={error}
        heading="Your progress"
        backHref={backHref}
        learningGainHref="/education/progress/learning-gain"
        onWeeklySeries={setWeekly}
        narrative={
          analytics && analytics.hasData ? (
            <NarrativeCard
              report={shownReport}
              conversationId={narrator.conversationId}
              loading={narrator.isNarrating}
              error={narrator.error}
              organizationState={organizationState}
              onRegenerate={() => {
                narratedRef.current = true;
                void runNarration(analytics);
              }}
            />
          ) : null
        }
      />
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}
