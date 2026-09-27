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
import type { StudyWeekSeries } from "../components/StudyTrends";
import { topicLabel } from "../utils/topicLabel";

const MAX_TOPICS = 30;
const MAX_GAIN_SUBJECTS = 8;
const MAX_RECOMMENDATIONS = 3;

export interface ProgressBundleInput {
  analytics: StudyAnalytics;
  narrative: NarrativeReport | null;
  gain: LearningGainReport | null;
  /** The charts' weekly series (accuracy + minutes), once loaded. */
  weekly?: StudyWeekSeries[] | null;
}

export function buildProgressOverviewXml({
  analytics,
  narrative,
  gain,
  weekly,
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

  // Every flashcard topic, weakest first, in short attributes so the whole
  // list fits: n=name, m=mastery %, c=cards, w=cards needing work, k=raw key.
  const topics = xmlList(
    "flashcard_topics",
    analytics.weakTopics,
    (t) =>
      xmlElement("t", {
        n: topicLabel(t.topic),
        // The raw key only when the name hides a path segment ("A::B").
        k: t.topic.includes("::") ? t.topic : null,
        m: t.masteryPct,
        c: t.count,
        w: t.struggling || null,
      }),
    { maxRows: MAX_TOPICS, attrs: { key: "n name, m mastery%, c cards, w need work" } },
  );

  // Weekly series as drawn on the two charts (every mode).
  const weeks =
    weekly && weekly.length > 0
      ? xmlList("weeks", weekly, (w) =>
          xmlElement("w", {
            d: w.week_start.slice(5),
            n: w.graded_answers || null,
            acc: w.accuracy_pct,
            min: w.minutes || null,
          }),
          { attrs: { key: "d week of MM-DD, n graded answers, acc %, min minutes; absent = none" } },
        )
      : "";

  const reading = narrative
    ? xmlElement("insights", {}, [
        xmlText("headline", narrative.headline, { max: 300 }),
        xmlList(
          "recommendations",
          narrative.recommendations,
          (r) =>
            xmlElement("recommendation", {
              action: r.action,
              why: r.why && r.why.length > 120 ? `${r.why.slice(0, 117)}...` : r.why,
              target: r.targetKind,
              topic: r.topic,
            }),
          { maxRows: MAX_RECOMMENDATIONS },
        ),
      ])
    : "";

  const gainEl =
    gain && gain.pairs.length > 0
      ? xmlList(
          "learning_gain",
          gain.pairs,
          (p) =>
            xmlElement("subject", {
              name: p.subjectLabel || p.subject,
              pre_pct: Math.round(p.baseline.score * 100),
              post_pct: Math.round(p.post.score * 100),
              gain_pts: Math.round(p.delta * 100),
            }),
          {
            maxRows: MAX_GAIN_SUBJECTS,
            attrs: {
              mean_delta_pts:
                gain.overallDelta == null
                  ? null
                  : Math.round(gain.overallDelta * 100),
              sample_data: gain.isSeed || gain.contractPending ? true : null,
            },
          },
        )
      : "";

  return xmlElement("progress_overview", { has_data: analytics.hasData }, [
    overall,
    trend,
    weeks,
    modes,
    topics,
    reading,
    gainEl,
  ]);
}
