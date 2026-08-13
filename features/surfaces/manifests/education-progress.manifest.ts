/**
 * Surface manifest — Progress (`matrx-user/education-progress`).
 *
 * The unified cross-mode study progress dashboard (P5) at `/education/progress`
 * — mastery, accuracy, weak areas, trends, an AI narrative, and a
 * learning-gain teaser, folded from the whole study spine — plus the
 * `/education/progress/learning-gain` pre/post report ("prove it makes you
 * smarter"). Both routes are 100% READ-ONLY: computed analytics over the
 * learner's own attempts, nothing here is authored or editable.
 *
 * WHY THIS MANIFEST EXISTS AT ALL. `route-to-surface.ts` already mapped
 * `/education/progress` → `matrx-user/education-progress`, and `ui.ui_surface`
 * already carried an ACTIVE row with a `url_pattern` — but there was no
 * manifest and no `SurfaceRuntimeProvider` anywhere in
 * `features/education/study/analytics/**` or `.../learning-gain/**`. Same
 * failure class as `education-memory`: agents were bindable here and blind
 * here (empty scope, silent fallback toast) — on the one surface where an
 * agent explaining "why is my accuracy dropping" or "what should I study next"
 * would matter most.
 *
 * TWO VIEWS, ONE SURFACE. `dashboard` (StudyAnalyticsDashboard, the whole
 * folded StudyAnalytics + the AI narrative) and `learning_gain`
 * (LearningGainReportView, the pre/post delta report) are steps in the same
 * "how am I doing" task, sharing no editable state and both consuming the
 * same `learningGainService`. `view` is the ONLY `alwaysAvailable: true`
 * value, same pattern as `education-memory` / `education-mind-maps`.
 *
 * NOT `StudentProgressView` (the guardian dashboard). `StudyAnalyticsDashboard`
 * documents itself as the SELF path over `useStudyAnalytics` (RLS-scoped to
 * the current user); `features/education/family/StudentProgressView` is a
 * second consumer of the same presentation-only `<StudyAnalyticsView>` but
 * over a LINKED STUDENT's spine, mounted from the family/guardian surface, not
 * from `/education/progress`. Different data path, different owner, out of
 * scope for this manifest — it belongs to a guardian/family surface if one is
 * authored later.
 *
 * Curated groups (band 0-899):
 *
 *   progress_view       Which of the two views is open (the discriminator)
 *   analytics_summary   The dashboard's folded cross-mode stats
 *   analytics_narrative  The AI-generated headline/insights/recommendations
 *   gain_report          The pre/post learning-gain report
 *
 * NO WRITE TARGETS. Every value on this surface is DERIVED EVIDENCE — computed
 * from the learner's own attempt history. There is nothing to author: no
 * form, no composer, no editable field anywhere in either component.
 *
 * Emitters: `StudyAnalyticsDashboard.tsx` (dashboard),
 * `LearningGainReportView.tsx` (learning_gain) — in
 * `features/education/study/analytics/components/` and
 * `features/education/study/learning-gain/components/`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "progress_view",
    label: "Progress view",
    sortOrder: 100,
    description:
      "Which of the two Progress views the learner is on — read this first, it decides which other groups are populated.",
  },
  {
    key: "analytics_summary",
    label: "Analytics summary",
    sortOrder: 200,
    description:
      "The dashboard view's folded cross-mode stats — overall mastery/accuracy, per-mode breakdown, weak topics, streak, and trend.",
  },
  {
    key: "analytics_narrative",
    label: "AI narrative",
    sortOrder: 300,
    description:
      "The dashboard view's AI-generated summary of the analytics above — a headline, grounded insights, and prioritized recommendations. Derived evidence; regenerated on demand.",
  },
  {
    key: "gain_report",
    label: "Learning-gain report",
    sortOrder: 400,
    description:
      "The learning_gain view's pre/post measured-improvement report — per-subject deltas and the overall normalized gain.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Progress view ──────────────────────────────────────────────────────
  {
    name: "view",
    label: "Current view",
    description:
      'Which Progress view is open: "dashboard" (the cross-mode analytics dashboard) or "learning_gain" (the pre/post learning-gain report). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 13,
    sortOrder: 300,
    group: "progress_view",
  },

  // ── Analytics summary (dashboard view) ─────────────────────────────────
  {
    name: "analytics_loading",
    label: "Analytics loading",
    description:
      "True while the cross-mode analytics are still being fetched/folded on the dashboard view. While true, the summary values below are absent. Absent on the learning_gain view.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "analytics_summary",
  },
  {
    name: "analytics_error",
    label: "Analytics error",
    description:
      "The error message shown when the analytics fetch failed. Absent on the happy path (the common case) and on the learning_gain view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 310,
    group: "analytics_summary",
  },
  {
    name: "analytics_has_data",
    label: "Has data",
    description:
      "True once the learner has studied enough for the analytics to be meaningful. False for a brand-new learner with an empty spine — in which case the numeric fields below are still present but all-zero, and no AI narrative is generated. Absent while loading and on the learning_gain view.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 320,
    group: "analytics_summary",
  },
  {
    name: "overall_stats",
    label: "Overall stats",
    description:
      "The learner's folded cross-mode totals as one object — { studied, mastered, learning, struggling, dueNow, totalAttempts, correctAttempts, accuracyPct, bestStreak }. accuracyPct is null when totalAttempts is 0. Absent while loading and on the learning_gain view.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 330,
    group: "analytics_summary",
  },
  {
    name: "mode_stats",
    label: "Stats by mode",
    description:
      "Per-study-mode breakdown (flashcards, quizzes, practice tests, …), each the same shape as overall_stats plus { itemType, label }. Empty array for a mode the learner hasn't tried. Absent while loading and on the learning_gain view.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 340,
    group: "analytics_summary",
  },
  {
    name: "weak_topics",
    label: "Weak topics",
    description:
      "Per-topic breakdown for the topic-bearing mode (flashcards), weakest first — each { topic, count, masteryPct, struggling }. Empty array when there isn't enough topic-tagged data yet. Absent while loading and on the learning_gain view.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 350,
    group: "analytics_summary",
  },
  {
    name: "total_minutes",
    label: "Total study minutes",
    description:
      "Total minutes studied across all sessions and modes. Absent while loading and on the learning_gain view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 360,
    group: "analytics_summary",
  },
  {
    name: "session_count",
    label: "Session count",
    description:
      "Total number of study sessions recorded. Absent while loading and on the learning_gain view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 370,
    group: "analytics_summary",
  },
  {
    name: "current_streak",
    label: "Current streak",
    description:
      "Current daily study streak in days (from study_streak — distinct from any per-item mastery streak). Absent while loading and on the learning_gain view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 380,
    group: "analytics_summary",
  },
  {
    name: "accuracy_trend",
    label: "Accuracy trend",
    description:
      'How accuracy is moving week over week — { direction: "improving" | "flat" | "declining", recentPct, priorPct, weeks }. Absent when there isn\'t enough history to compute a trend, while loading, and on the learning_gain view.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 390,
    group: "analytics_summary",
  },
  {
    name: "gain_teaser_available",
    label: "Learning-gain teaser available",
    description:
      "True when the dashboard has a learning-gain report to tease (linking to the learning_gain view). Absent while loading and on the learning_gain view.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 400,
    group: "analytics_summary",
  },

  // ── AI narrative (dashboard view) ──────────────────────────────────────
  {
    name: "narrative_loading",
    label: "Narrative generating",
    description:
      "True while the AI narrator is producing the headline/insights/recommendations. Absent on the learning_gain view. The dashboard auto-narrates once when analytics_has_data is true and overall_stats.studied is at least 3.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "analytics_narrative",
  },
  {
    name: "narrative_error",
    label: "Narrative error",
    description:
      "Error from the narration attempt, if any. Absent on the happy path — narration is optional chrome, so a failure here does not affect the numeric analytics. Absent on the learning_gain view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 310,
    group: "analytics_narrative",
  },
  {
    name: "narrative_headline",
    label: "Narrative headline",
    description:
      "The AI narrator's one-line summary of the learner's current standing. Absent before narration has run, while it is loading, on an error, and on the learning_gain view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 320,
    group: "analytics_narrative",
  },
  {
    name: "narrative_insights",
    label: "Narrative insights",
    description:
      'Grounded observations from the narrator, each { title, detail, severity: "good" | "watch" | "urgent" }. Absent under the same conditions as narrative_headline.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 330,
    group: "analytics_narrative",
  },
  {
    name: "narrative_recommendations",
    label: "Narrative recommendations",
    description:
      'Prioritized next actions from the narrator, each { action, why, targetKind, topic }, where targetKind is one of "review" | "weak_area" | "learn" | "quiz" | "practice_test" or null. Absent under the same conditions as narrative_headline. This is the surface\'s own best answer to "what should I study next" — read it before improvising a recommendation.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 340,
    group: "analytics_narrative",
  },

  // ── Learning-gain report (learning_gain view) ──────────────────────────
  {
    name: "gain_loading",
    label: "Report loading",
    description:
      "True while the learning-gain report is still being fetched on the learning_gain view. Absent on the dashboard view.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "gain_report",
  },
  {
    name: "gain_error",
    label: "Report error",
    description:
      "Error message when the report failed to load. Absent on the happy path and on the dashboard view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 310,
    group: "gain_report",
  },
  {
    name: "gain_pairs",
    label: "Baseline→post pairs",
    description:
      "Every subject with a complete baseline+post measurement, each { subject, subjectLabel, baseline: {score, takenAt}, post: {score, takenAt}, delta, normalizedGain }. Empty array when the learner has no complete pairs yet (the report shows an empty state). Absent while loading and on the dashboard view.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 320,
    group: "gain_report",
  },
  {
    name: "gain_overall_delta",
    label: "Overall delta",
    description:
      "Mean baseline→post score delta across all paired subjects (0..1, can be negative). Null when there are no complete pairs. Absent while loading and on the dashboard view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 330,
    group: "gain_report",
  },
  {
    name: "gain_overall_normalized",
    label: "Overall normalized gain",
    description:
      "Mean normalized gain (Hake's g) across subjects where it's defined (0..1) — the share of what was left to learn that was actually learned. Null when undefined for every subject. Absent while loading and on the dashboard view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 340,
    group: "gain_report",
  },
  {
    name: "gain_is_seed",
    label: "Sample data",
    description:
      "True when the report is showing SEED FIXTURES, not the learner's real measurements — because the underlying P1 assessment-engine table isn't live yet or the learner has no real pairs. When true, describe the numbers as illustrative, never as the learner's actual results. Absent while loading and on the dashboard view.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 350,
    group: "gain_report",
  },
];

export const educationProgressManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-progress",
  readiness: "partial",
  readinessNote:
    "Manifest + both emitters (dashboard, learning_gain) shipped, targeting a live DB row that previously had no manifest at all. NOT yet: DB sync has not been run; no write targets are declared (every value here is derived evidence — correctly so, nothing on either view is editable); no agent roles or config namespaces are declared; no data-surface-value Locate anchors are tagged; no live-agent-run verification or Matrx-vs-matrix test has been performed; the guardian/family progress view (StudentProgressView, a different data path over a linked student's spine) is explicitly OUT of scope for this manifest — see header.",
  label: "Progress",
  urlPattern: "/education/progress",
  intro: `<surface_intro>
You are on the Progress surface at /education/progress — the learner's own cross-mode study analytics: mastery, accuracy, weak areas, trends, and a pre/post learning-gain report. Everything here is READ-ONLY derived evidence computed from the learner's real attempt history; there is nothing to author on either view.
Read \`view\` first — it is "dashboard" or "learning_gain".
On "dashboard": \`overall_stats\` and \`mode_stats\` are the folded totals; \`weak_topics\` names what needs work; \`accuracy_trend\` says whether things are improving; \`current_streak\` and \`total_minutes\`/\`session_count\` round out the picture. \`analytics_has_data\` is false for a brand-new learner — don't describe an empty spine as "struggling". Once there's enough data, an AI narrator runs automatically: \`narrative_headline\`, \`narrative_insights\`, and especially \`narrative_recommendations\` are the surface's own best answer to "what should I study next" — read them before improvising a suggestion, and prefer them over re-deriving your own from the raw stats.
On "learning_gain": \`gain_pairs\` holds each subject's baseline→post measurement; \`gain_overall_delta\` and \`gain_overall_normalized\` are the headline numbers ("prove it makes you smarter"). Check \`gain_is_seed\` FIRST — while the underlying assessment-engine table isn't live, this report shows labeled SAMPLE data, and you must describe it as illustrative, never as the learner's actual results.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** `overall_stats`, and each entry of `mode_stats` shares this shape plus itemType/label. */
export interface ProgressOverallStats {
  studied: number;
  mastered: number;
  learning: number;
  struggling: number;
  dueNow: number;
  totalAttempts: number;
  correctAttempts: number;
  accuracyPct: number | null;
  bestStreak: number;
}

/** One entry of `mode_stats`. */
export interface ProgressModeStat extends ProgressOverallStats {
  itemType: string;
  label: string;
}

/** One entry of `weak_topics`. */
export interface ProgressTopicStat {
  topic: string;
  count: number;
  masteryPct: number;
  struggling: number;
}

/** `accuracy_trend`. */
export interface ProgressAccuracyTrend {
  direction: "improving" | "flat" | "declining";
  recentPct: number;
  priorPct: number;
  weeks: number;
}

/** One entry of `narrative_insights`. */
export interface ProgressNarrativeInsight {
  title: string;
  detail: string;
  severity: "good" | "watch" | "urgent";
}

/** One entry of `narrative_recommendations`. */
export interface ProgressNarrativeRecommendation {
  action: string;
  why: string;
  targetKind: "review" | "weak_area" | "learn" | "quiz" | "practice_test" | null;
  topic: string | null;
}

/** One entry of `gain_pairs`. */
export interface ProgressGainPair {
  subject: string;
  subjectLabel: string;
  baseline: { score: number; takenAt: string };
  post: { score: number; takenAt: string };
  delta: number;
  normalizedGain: number | null;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 *
 * Only `view` is guaranteed: the two views share this surface and each
 * emitter can honestly supply only its own group.
 */
export function createEducationProgressScope(values: {
  // alwaysAvailable: true → required
  view: "dashboard" | "learning_gain";
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  // dashboard — analytics summary
  analytics_loading?: boolean;
  analytics_error?: string;
  analytics_has_data?: boolean;
  overall_stats?: ProgressOverallStats;
  mode_stats?: ProgressModeStat[];
  weak_topics?: ProgressTopicStat[];
  total_minutes?: number;
  session_count?: number;
  current_streak?: number;
  accuracy_trend?: ProgressAccuracyTrend;
  gain_teaser_available?: boolean;
  // dashboard — narrative
  narrative_loading?: boolean;
  narrative_error?: string;
  narrative_headline?: string;
  narrative_insights?: ProgressNarrativeInsight[];
  narrative_recommendations?: ProgressNarrativeRecommendation[];
  // learning_gain
  gain_loading?: boolean;
  gain_error?: string;
  gain_pairs?: ProgressGainPair[];
  gain_overall_delta?: number;
  gain_overall_normalized?: number;
  gain_is_seed?: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
