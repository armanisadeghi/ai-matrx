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
import { learningGainService } from "../../learning-gain/learningGainService";
import type { LearningGainReport } from "../../learning-gain/types";
import type { NarrativeReport } from "../narrative";
import { NarrativeCard } from "./NarrativeCard";
import { StudyAnalyticsView } from "./StudyAnalyticsView";
import type { StudyAnalytics } from "../computeAnalytics";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationProgressScope } from "@/features/surfaces/manifests/education-progress.manifest";

const SURFACE_NAME = "matrx-user/education-progress";

export function StudyAnalyticsDashboard({
  backHref = "/education",
}: {
  backHref?: string;
}) {
  const { analytics, mastery, loading, error } = useStudyAnalytics();
  const narrator = useAnalyticsNarrative();
  const [report, setReport] = useState<NarrativeReport | null>(null);
  const [gain, setGain] = useState<LearningGainReport | null>(null);
  const narratedRef = useRef(false);

  // Read at trigger time, never from stale closure state.
  const buildScope = () =>
    createEducationProgressScope({
      view: "dashboard",
      analytics_loading: loading,
      analytics_error: error ?? undefined,
      ...(loading || !analytics
        ? {}
        : {
            analytics_has_data: analytics.hasData,
            overall_stats: analytics.overall,
            mode_stats: analytics.byMode,
            weak_topics: analytics.weakTopics,
            total_minutes: analytics.totalMinutes,
            session_count: analytics.sessions,
            current_streak: analytics.currentStreak,
            accuracy_trend: analytics.trend ?? undefined,
            gain_teaser_available: Boolean(gain && gain.pairs.length > 0),
          }),
      narrative_loading: narrator.isNarrating,
      narrative_error: narrator.error ?? undefined,
      ...(report
        ? {
            narrative_headline: report.headline,
            narrative_insights: report.insights,
            narrative_recommendations: report.recommendations,
          }
        : {}),
    });

  const runNarration = async (a: StudyAnalytics) => {
    try {
      const r = await narrator.narrate(a);
      setReport(r);
    } catch {
      /* narration is optional chrome — numbers stand on their own */
    }
  };

  // Auto-narrate once when meaningful data is present.
  useEffect(() => {
    if (
      analytics &&
      analytics.hasData &&
      analytics.overall.studied >= 3 &&
      !narratedRef.current
    ) {
      narratedRef.current = true;
      void runNarration(analytics);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics]);

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
      <StudyAnalyticsView
        analytics={analytics}
        mastery={mastery}
        gain={gain}
        loading={loading}
        error={error}
        heading="Your progress"
        backHref={backHref}
        learningGainHref="/education/progress/learning-gain"
        narrative={
          analytics && analytics.hasData ? (
            <NarrativeCard
              report={report}
              conversationId={narrator.conversationId}
              loading={narrator.isNarrating}
              error={narrator.error}
              onRegenerate={() => {
                narratedRef.current = true;
                void runNarration(analytics);
              }}
            />
          ) : null
        }
      />
    </SurfaceRuntimeProvider>
  );
}
