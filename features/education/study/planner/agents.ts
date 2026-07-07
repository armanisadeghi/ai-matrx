// features/education/study/planner/agents.ts
//
// Live agent ids for the P5 Study Intelligence AI lanes. Permanent ids track
// the latest published version so prompts can be tuned in-system with no code
// change (pin a version only if a surface needs reproducibility).
//
// Authored via agent_author (2026-07-07). Both are gemini-flash-class, cheap +
// fast — structured planning / narration, not deep reasoning.

export const STUDY_AGENTS = {
  /**
   * Study Planner — anti-burnout day-by-day schedule.
   * Variables (builder-shaped): goal_title, start_date, exam_date,
   * daily_minutes, rest_days (comma-separated weekday NAMES, e.g. "Sunday"),
   * study_snapshot (formatted text — see `buildStudySnapshot`).
   * Output: { overall_rationale, days:[{day_date,is_rest_day,rationale,blocks:[…]}] }.
   */
  planner: "49d3c256-fdb4-4c9c-8965-6b35e638f698",

  /**
   * Study Analytics Narrator — headline + grounded insights + prioritized recs.
   * Variables: item_label, accuracy_pct, mastered_count, learning_count,
   * struggling_count, due_count, accuracy_trend (JSON), topic_breakdown (JSON),
   * total_minutes, current_streak.
   * Output: { headline, insights:[{title,detail,severity}], recommendations:[…] }.
   */
  narrator: "13c31086-6420-4f8a-822d-6d0bc48a18e0",
} as const;

export type StudyAgentKey = keyof typeof STUDY_AGENTS;

/** Weekday index (0=Sun) → the name the planner agent's rest_days variable expects. */
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Map ISO weekday numbers to the comma-separated names the planner agent reads. */
export function restDaysToNames(restDays: number[]): string {
  return restDays
    .filter((d) => d >= 0 && d <= 6)
    .map((d) => WEEKDAY_NAMES[d])
    .join(", ");
}
