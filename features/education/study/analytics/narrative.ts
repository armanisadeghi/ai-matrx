// features/education/study/analytics/narrative.ts
//
// Types + coercion for the Study Analytics Narrator output. The narrator turns
// the computed `StudyAnalytics` numbers into a headline + grounded insights +
// prioritized recommendations. Coercion is tolerant (drops malformed entries)
// so a prompt tweak never hard-breaks the dashboard.

import type { StudyAnalytics } from "./computeAnalytics";

export type InsightSeverity = "good" | "watch" | "urgent";
export type RecKind =
  | "review"
  | "weak_area"
  | "learn"
  | "quiz"
  | "practice_test";

export interface NarrativeInsight {
  title: string;
  detail: string;
  severity: InsightSeverity;
}

export interface NarrativeRecommendation {
  action: string;
  why: string;
  targetKind: RecKind | null;
  topic: string | null;
}

export interface NarrativeReport {
  headline: string;
  insights: NarrativeInsight[];
  recommendations: NarrativeRecommendation[];
}

const SEVERITIES: InsightSeverity[] = ["good", "watch", "urgent"];
const REC_KINDS: RecKind[] = [
  "review",
  "weak_area",
  "learn",
  "quiz",
  "practice_test",
];

function str(r: Record<string, unknown>, key: string): string {
  return typeof r[key] === "string" ? (r[key] as string).trim() : "";
}
function optStr(r: Record<string, unknown>, key: string): string | null {
  const v = r[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * A count the narrator declares `integer` (`education.analytics_narrate`): a
 * whole, non-negative number — never a string, a float, or NaN (a string or a
 * float is refused the moment a consumption map is bound).
 */
function wholeCount(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/** Build the narrator agent's variables from computed analytics. */
export function narrativeVariables(
  a: StudyAnalytics,
  itemLabel = "cards",
): Record<string, string | number> {
  const topicBreakdown = a.weakTopics.slice(0, 8).map((t) => ({
    topic: t.topic,
    mastery_pct: t.masteryPct,
    struggling: t.struggling,
    count: t.count,
  }));
  return {
    item_label: itemLabel,
    accuracy_pct: a.overall.accuracyPct == null ? "none" : String(a.overall.accuracyPct),
    mastered_count: wholeCount(a.overall.mastered),
    learning_count: wholeCount(a.overall.learning),
    struggling_count: wholeCount(a.overall.struggling),
    due_count: wholeCount(a.overall.dueNow),
    accuracy_trend: a.trend ? JSON.stringify(a.trend) : "insufficient",
    topic_breakdown: JSON.stringify(topicBreakdown),
    total_minutes: wholeCount(a.totalMinutes),
    current_streak: wholeCount(a.currentStreak),
  };
}

/** Coerce the narrator's raw JSON into a `NarrativeReport`; throws only if empty. */
export function coerceNarrative(value: unknown): NarrativeReport {
  if (!value || typeof value !== "object") {
    throw new Error("Narrator did not return a JSON object");
  }
  const obj = value as Record<string, unknown>;
  const headline = str(obj, "headline");

  const insights: NarrativeInsight[] = (
    Array.isArray(obj.insights) ? obj.insights : []
  )
    .map((raw): NarrativeInsight | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const title = str(r, "title");
      if (!title) return null;
      const sev = str(r, "severity") as InsightSeverity;
      return {
        title,
        detail: str(r, "detail"),
        severity: SEVERITIES.includes(sev) ? sev : "watch",
      };
    })
    .filter((i): i is NarrativeInsight => i !== null);

  const recommendations: NarrativeRecommendation[] = (
    Array.isArray(obj.recommendations) ? obj.recommendations : []
  )
    .map((raw): NarrativeRecommendation | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const action = str(r, "action");
      if (!action) return null;
      // The wire says `target_kind`; a reading saved after coercion says
      // `targetKind`. Both are the same field — reading only the wire spelling
      // nulled every saved step's type on reload.
      const kind = (str(r, "target_kind") || str(r, "targetKind")) as RecKind;
      return {
        action,
        why: str(r, "why"),
        targetKind: REC_KINDS.includes(kind) ? kind : null,
        topic: optStr(r, "topic"),
      };
    })
    .filter((rec): rec is NarrativeRecommendation => rec !== null);

  if (!headline && insights.length === 0 && recommendations.length === 0) {
    throw new Error("Narrator returned an empty report");
  }
  return { headline, insights, recommendations };
}

/**
 * A stable fingerprint of the LEARNING a narration was written from
 * (FOUND_DEFECTS D151). The dashboard stores the reading against this; on the
 * next visit an identical fingerprint means the stored reading is still the
 * right one and the ~120s narrator run is NOT re-paid for.
 *
 * It moves only when an answer is recorded: items studied and the answer
 * ledger's totals. Never the session count, minutes or streak — opening a
 * review creates a session with no answers, and that used to buy a fresh
 * reading (three different readings in one sitting, 2026-09-27). Nor the
 * mastered/learning/needs-work split, which drifts with FSRS time decay
 * without the learner doing anything.
 */
export function narrativeFingerprint(analytics: StudyAnalytics): string {
  const o = analytics.overall;
  return ["v2", o.studied, o.totalAttempts, o.correctAttempts].join(":");
}

/** Read a stored narration back off a session's AI journal (null when absent). */
export function readStoredNarrative(value: unknown): NarrativeReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const headline = typeof obj.headline === "string" ? obj.headline : "";
  if (!headline) return null;
  try {
    return coerceNarrative(obj);
  } catch {
    return null;
  }
}
