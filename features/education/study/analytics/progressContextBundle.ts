// features/education/study/analytics/progressContextBundle.ts
//
// The Progress page's up-front context for agents: ONE compact XML overview
// (~2,000-3,000 chars — a broad dashboard, per the page-pass context budget),
// built by the pure helpers in `features/surfaces/runtime/context-bundle.ts`
// from state the dashboard already rendered. Never fetches.
//
// It carries what the likely jobs ("how am I doing", "what should I study
// next", "why is my accuracy dropping") need without a lookup: the totals, the
// per-mode split, the weakest topics by name, the trend, and the narrator's
// own recommendations. Full rows stay in the individual values.

import {
  xmlElement,
  xmlList,
  xmlText,
} from "@/features/surfaces/runtime/context-bundle";
import type { StudyAnalytics } from "./computeAnalytics";
import type { NarrativeReport } from "./narrative";
import type { LearningGainReport } from "../learning-gain/types";
import { topicLabel } from "../utils/topicLabel";

const MAX_TOPICS = 12;
const MAX_RECOMMENDATIONS = 5;

export interface ProgressBundleInput {
  analytics: StudyAnalytics;
  narrative: NarrativeReport | null;
  gain: LearningGainReport | null;
}

export function buildProgressOverviewXml({
  analytics,
  narrative,
  gain,
}: ProgressBundleInput): string {
  const o = analytics.overall;
  const overall = xmlElement("overall", {
    studied: o.studied,
    mastered: o.mastered,
    learning: o.learning,
    needs_work: o.struggling,
    due_now: o.dueNow,
    accuracy_pct: o.accuracyPct,
    graded_attempts: o.totalAttempts,
    day_streak: analytics.currentStreak,
    minutes_studied: analytics.totalMinutes,
    sessions: analytics.sessions,
  });

  const trend = analytics.trend
    ? xmlElement("accuracy_trend", {
        direction: analytics.trend.direction,
        recent_pct: analytics.trend.recentPct,
        prior_pct: analytics.trend.priorPct,
        weeks: analytics.trend.weeks,
      })
    : "";

  const modes = xmlList("modes", analytics.byMode, (m) =>
    xmlElement("mode", {
      name: m.label,
      studied: m.studied,
      mastered: m.mastered,
      accuracy_pct: m.accuracyPct,
    }),
  );

  const topics = xmlList(
    "weakest_topics",
    analytics.weakTopics,
    (t) =>
      xmlElement("topic", {
        name: topicLabel(t.topic),
        key: topicLabel(t.topic) === t.topic ? null : t.topic,
        mastery_pct: t.masteryPct,
        cards: t.count,
        needs_work: t.struggling,
      }),
    { maxRows: MAX_TOPICS },
  );

  const reading = narrative
    ? xmlElement("insights", {}, [
        xmlText("headline", narrative.headline, { max: 300 }),
        xmlList(
          "recommendations",
          narrative.recommendations,
          (r) =>
            xmlElement("recommendation", {
              action: r.action,
              why: r.why,
              target: r.targetKind,
              topic: r.topic,
            }),
          { maxRows: MAX_RECOMMENDATIONS },
        ),
      ])
    : "";

  const gainEl =
    gain && gain.pairs.length > 0
      ? xmlElement("learning_gain", {
          subjects: gain.pairs.length,
          mean_delta_pct:
            gain.overallDelta == null
              ? null
              : Math.round(gain.overallDelta * 100),
          sample_data: gain.isSeed ? true : null,
        })
      : "";

  return xmlElement("progress_overview", { has_data: analytics.hasData }, [
    overall,
    trend,
    modes,
    topics,
    reading,
    gainEl,
  ]);
}
