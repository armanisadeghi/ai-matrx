// features/education/study/planner/buildPlan.ts
//
// The DETERMINISTIC study-plan generator — the heuristic fallback and the
// reference distribution the planner agent improves on. Pure over a study
// summary (no I/O, fully unit-testable): given availability, exam date, and a
// snapshot of what's due / weak, it lays out a day-by-day schedule with
// anti-burnout load-smoothing (gentle daily caps, honored rest days, a light
// day before the exam). Emits a `PlanDraft` — the same shape the agent emits —
// so `planService.savePlan` never knows which generator produced it.

import type {
  PlanBlockDraft,
  PlanDayDraft,
  PlanDraft,
  PlanInput,
  Weekday,
} from "./types";

const MS_PER_DAY = 86_400_000;
/** Rough pacing constants (minutes per item) used to size blocks. */
const MIN_PER_REVIEW = 0.6;
const MIN_PER_WEAK = 1.2;

/** A per-topic weak-area tally the heuristic front-loads. */
export interface WeakTopic {
  topic: string;
  count: number;
}

/** The study snapshot the heuristic distributes across the plan window. */
export interface PlanSummary {
  /** Items due for review now (FSRS `due_at <= now`). */
  dueCount: number;
  /** Items flagged struggling / low-retrievability. */
  weakCount: number;
  /** Optional per-topic weak breakdown — front-loaded weakest-first. */
  weakTopics?: WeakTopic[];
  /** Total studied items of this type (for a sane "learn new" tail). */
  studiedCount?: number;
}

function toDate(iso: string): Date {
  // Parse as a local calendar date (avoid UTC shift on YYYY-MM-DD).
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Every calendar date from start..end inclusive. */
function datesBetween(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cur.getTime() <= last.getTime()) {
    out.push(new Date(cur));
    cur.setTime(cur.getTime() + MS_PER_DAY);
  }
  return out;
}

/**
 * Build a day-by-day plan. `now` is injected (never `Date.now()` here) so the
 * function stays pure and testable.
 */
export function buildPlan(
  input: PlanInput,
  summary: PlanSummary,
  now: Date,
): PlanDraft {
  const itemType = input.itemType ?? "fc_card";
  const start = toDate(input.startDate);
  const exam = toDate(input.examDate);
  const restSet = new Set<Weekday>(input.restDays);

  const allDates = datesBetween(start, exam);
  const studyDates = allDates.filter(
    (d) => !restSet.has(d.getDay() as Weekday),
  );
  const studyDayCount = Math.max(1, studyDates.length);

  // Anti-burnout: spread the weak backlog across the whole window (never dump
  // it all on day one), capped per day so no single day becomes a wall.
  const weakTopics = (summary.weakTopics ?? [])
    .slice()
    .sort((a, b) => b.count - a.count);
  const perDayWeakTarget = Math.ceil(summary.weakCount / studyDayCount);
  const reviewPerDay = Math.ceil(summary.dueCount / studyDayCount);
  const itemCap = input.dailyItemCap ?? null;

  // Anti-burnout re-entry ramp (recovery-after-absence): scale the first study
  // days down so the return isn't a wall of overdue items. 0-based study-day
  // index → load multiplier. No-op unless `input.reentry` is set.
  const reentry = input.reentry ?? false;
  const rampFactor = (studyIdx: number): number => {
    if (!reentry) return 1;
    if (studyIdx <= 0) return 0.4;
    if (studyIdx === 1) return 0.7;
    return 1;
  };

  const days: PlanDayDraft[] = [];
  let weakCursor = 0; // rotate through weak topics across days

  for (const [idx, date] of allDates.entries()) {
    const dayIso = isoDate(date);
    const isRest = restSet.has(date.getDay() as Weekday);
    if (isRest) {
      days.push({
        dayDate: dayIso,
        targetMinutes: 0,
        isRestDay: true,
        rationale: "Scheduled rest day — recovery protects retention.",
        blocks: [
          {
            dayDate: dayIso,
            targetKind: "rest",
            label: "Rest day",
            estimatedMinutes: 0,
            ordering: 0,
            rationale: "Rest is part of the plan, not a gap in it.",
          },
        ],
      });
      continue;
    }

    const studyIndex = studyDates.findIndex((d) => isoDate(d) === dayIso);
    const isLastStudyDay = studyIndex === studyDates.length - 1;
    const isExamEve =
      isLastStudyDay ||
      date.getTime() === exam.getTime() - MS_PER_DAY;

    const blocks: PlanBlockDraft[] = [];
    let order = 0;

    // The day of / right before the exam: light confirmatory review + a
    // full-length practice test, no heavy new load (anti-cram).
    if (isExamEve || date.getTime() === exam.getTime()) {
      blocks.push({
        dayDate: dayIso,
        targetKind: "practice_test",
        itemType,
        targetRef: input.goalId ? { goalId: input.goalId } : {},
        label: "Full practice test",
        estimatedMinutes: Math.max(20, Math.round(input.dailyMinutes * 0.6)),
        method: "practice_test",
        ordering: order++,
        rationale:
          "A timed run under real conditions beats last-minute cramming.",
      });
      if (summary.dueCount > 0) {
        blocks.push({
          dayDate: dayIso,
          targetKind: "review",
          itemType,
          label: "Light confidence review",
          estimatedMinutes: Math.max(10, Math.round(input.dailyMinutes * 0.3)),
          estimatedItems: Math.min(reviewPerDay, itemCap ?? reviewPerDay),
          method: "classic_review",
          ordering: order++,
          rationale: "Reinforce, don't overload, right before the exam.",
        });
      }
    } else {
      // Normal day: weak-area drill first (highest leverage), then due review.
      let itemsUsed = 0;
      const factor = rampFactor(studyIndex);
      const capRemaining = () =>
        itemCap == null ? Infinity : Math.max(0, itemCap - itemsUsed);

      if (summary.weakCount > 0 && capRemaining() > 0) {
        const topic =
          weakTopics.length > 0
            ? weakTopics[weakCursor % weakTopics.length]
            : null;
        weakCursor += 1;
        const weakItems = Math.min(
          Math.max(1, Math.round(perDayWeakTarget * factor)),
          capRemaining(),
        );
        itemsUsed += weakItems;
        blocks.push({
          dayDate: dayIso,
          targetKind: "weak_area",
          itemType,
          targetRef: topic ? { topic: topic.topic } : {},
          label: topic
            ? `Drill weak area: ${topic.topic}`
            : "Drill your weak areas",
          estimatedMinutes: Math.round(weakItems * MIN_PER_WEAK),
          estimatedItems: weakItems,
          method: "fast_fire",
          ordering: order++,
          rationale:
            "The smallest set of material causing the most errors — biggest gain per minute.",
        });
      }

      if (summary.dueCount > 0 && capRemaining() > 0) {
        const reviewItems = Math.min(
          Math.max(1, Math.round(reviewPerDay * factor)),
          capRemaining(),
        );
        itemsUsed += reviewItems;
        blocks.push({
          dayDate: dayIso,
          targetKind: "review",
          itemType,
          targetRef: input.goalId ? { goalId: input.goalId } : {},
          label: "Spaced review (due today)",
          estimatedMinutes: Math.round(reviewItems * MIN_PER_REVIEW),
          estimatedItems: reviewItems,
          method: "classic_review",
          ordering: order++,
          rationale: "Reviewing right as items come due is what makes FSRS work.",
        });
      }

      // Nothing due and nothing weak (early in a plan): a light learn block.
      if (blocks.length === 0) {
        blocks.push({
          dayDate: dayIso,
          targetKind: "learn",
          itemType,
          targetRef: input.goalId ? { goalId: input.goalId } : {},
          label: "Study new material",
          estimatedMinutes: Math.min(input.dailyMinutes, 20),
          method: "classic_review",
          ordering: order++,
          rationale: "Build the base now so spaced review has something to lift.",
        });
      }
    }

    const targetMinutes = blocks.reduce((s, b) => s + b.estimatedMinutes, 0);
    const isFirstStudyDay = studyIndex === 0;
    days.push({
      dayDate: dayIso,
      targetMinutes: Math.min(targetMinutes, input.dailyMinutes + 20),
      isRestDay: false,
      rationale: isExamEve
        ? "Taper day — confirm, don't cram."
        : reentry && isFirstStudyDay
          ? "Welcome back — a lighter first day to ease you in. No wall of overdue items; just the highest-leverage work."
          : reentry && studyIndex === 1
            ? "Ramping back up — still gentle so momentum holds."
            : idx === 0
              ? "Kickoff — start with your highest-leverage weak areas."
              : null,
      blocks,
    });
  }

  const daysUntilExam = Math.max(
    0,
    Math.round((exam.getTime() - now.getTime()) / MS_PER_DAY),
  );

  return {
    title: input.title,
    startDate: input.startDate,
    endDate: input.examDate,
    dailyMinutes: input.dailyMinutes,
    dailyItemCap: input.dailyItemCap ?? null,
    restDays: input.restDays,
    goalId: input.goalId ?? null,
    generatedBy: "heuristic",
    rationale: reentry
      ? `Welcome back. This is your recovery plan — the remaining ${studyDayCount} study day${studyDayCount === 1 ? "" : "s"} to your exam, rebuilt from scratch. ` +
        `Your overdue backlog was triaged and spread across the window (not dumped on you), the first day is deliberately light to ease you back in, ` +
        `and rest days stay protected. No guilt wall — just the highest-leverage work, re-paced.`
      : `A ${studyDayCount}-study-day plan over ${daysUntilExam} days to your exam. ` +
        `Weak areas are front-loaded and spread out so no single day is a wall; ` +
        `rest days are protected; the run finishes with a full practice test instead of a cram.`,
    config: {
      summary,
      itemType,
      generatedFrom: "heuristic",
      ...(reentry ? { recovery: true } : {}),
    },
    days,
  };
}
