// features/education/study/planner/mandates.ts
//
// Mandate keys for the P5 Study Intelligence AI lanes. These are MANDATE KEYS,
// not agent ids: each key resolves LIVE (system default → org binding → user
// binding) to whatever agent the DATABASE currently binds — agent identity
// never lives in code. Swap the agent at /agents/mandates; no code change, no
// deploy. See features/agents/mandates/FEATURE.md.

export const STUDY_MANDATES = {
  /**
   * Study Planner — anti-burnout day-by-day schedule.
   * Variables: goal_title, start_date, exam_date, daily_minutes, rest_days
   * (comma-separated weekday NAMES — see `restDaysToNames`), study_snapshot.
   * Output: { overall_rationale, days:[{day_date,is_rest_day,rationale,blocks:[…]}] }.
   */
  planner: "education.plan_generate",
  /**
   * Study Analytics Narrator — headline + grounded insights + prioritized recs.
   * Variables: item_label, accuracy_pct, mastered_count, learning_count,
   * struggling_count, due_count, accuracy_trend (JSON), topic_breakdown (JSON),
   * total_minutes, current_streak.
   * Output: { headline, insights:[{title,detail,severity}], recommendations:[…] }.
   */
  narrator: "education.analytics_narrate",
} as const;

export type StudyMandateKey = keyof typeof STUDY_MANDATES;

/** Weekday index (0=Sun) → the name the planner's rest_days variable expects. */
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Map ISO weekday numbers to the comma-separated names the planner reads. */
export function restDaysToNames(restDays: number[]): string {
  return restDays
    .filter((d) => d >= 0 && d <= 6)
    .map((d) => WEEKDAY_NAMES[d])
    .join(", ");
}
