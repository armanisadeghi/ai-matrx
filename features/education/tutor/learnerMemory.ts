// features/education/tutor/learnerMemory.ts
//
// CROSS-SESSION LEARNER MEMORY — the thing that makes the AI Tutor a tutor and
// not a chatbot (VISION §4, P2). It reads the shared study spine (sessions,
// attempts, item_mastery FSRS state, streak, goals) and assembles a compact,
// human-readable snapshot of who this learner is: what they've studied lately,
// how well, what they're weak at, their streak, and their upcoming exams.
//
// This is the ONE cross-session assembler. `features/education/tutor/lanes/
// learnerContext.ts` reshapes only the CURRENT session's in-memory state; this
// module queries the spine across days/weeks. The tutor conversation injects
// `summaryText` into the request `context` channel every turn so the model can
// say "last week you struggled with X" from real data.
//
// Mode-agnostic: it reads the polymorphic spine by `item_type`. Human labels
// for `fc_card` weak areas are resolved by a DYNAMIC import of fcService (same
// pattern as StudyTrends) so this foundational module never statically depends
// on the flashcards feature.

import { studyService } from "@/features/education/study/service/studyService";
import type {
  ItemMasteryRow,
  StudyAttemptRow,
} from "@/features/education/study/types";

/** The default study item_type the memory is assembled over (flashcards today). */
export const DEFAULT_MEMORY_ITEM_TYPE = "fc_card";

export interface MemoryRecentSession {
  mode: string;
  /** ISO timestamp the session started. */
  when: string;
  /** Weighted accuracy 0-100, or null if the session had no graded attempts. */
  accuracyPct: number | null;
  total: number;
}

export interface MemoryWeakArea {
  /** Human label — a topic for fc_card, else the item id. */
  label: string;
  itemType: string;
  itemId: string;
  /** Live FSRS retrievability 0-1 (write-time snapshot), or null. */
  retrievability: number | null;
  struggle: boolean;
}

export interface MemoryGoal {
  title: string;
  targetDate: string | null;
  /** Whole days from today to the target date, or null when undated. */
  daysUntil: number | null;
  itemType?: string;
  topic?: string;
}

export interface LearnerMemory {
  /** False when there is genuinely nothing on the spine yet (new learner). */
  hasData: boolean;
  streak: { current: number; longest: number } | null;
  recentSessions: MemoryRecentSession[];
  weakAreas: MemoryWeakArea[];
  /** Weighted accuracy over the assembly window, 0-100, or null. */
  windowAccuracyPct: number | null;
  masteryDistribution: { strong: number; medium: number; weak: number };
  goals: MemoryGoal[];
  /**
   * A compact natural-language block for injection into the tutor conversation
   * `context`. Empty string when `hasData` is false.
   */
  summaryText: string;
}

export interface AssembleLearnerMemoryOptions {
  /** Study item_type to read (default 'fc_card'). */
  itemType?: string;
  /** How many days back to look for recent activity + trend (default 21). */
  windowDays?: number;
  /** Max recent sessions to include (default 6). */
  sessionLimit?: number;
  /** Max weak areas to surface (default 6). */
  weakLimit?: number;
}

const EMPTY_MEMORY: LearnerMemory = {
  hasData: false,
  streak: null,
  recentSessions: [],
  weakAreas: [],
  windowAccuracyPct: null,
  masteryDistribution: { strong: 0, medium: 0, weak: 0 },
  goals: [],
  summaryText: "",
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const ms = target - Date.now();
  return Math.round(ms / 86_400_000);
}

function windowAccuracy(attempts: StudyAttemptRow[]): number | null {
  const graded = attempts.filter((a) => a.result != null);
  if (graded.length === 0) return null;
  const sum = graded.reduce((acc, a) => {
    const v =
      typeof a.score_value === "number"
        ? a.score_value
        : a.result === "correct"
          ? 1
          : a.result === "partial"
            ? 0.5
            : 0;
    return acc + v;
  }, 0);
  return Math.round((sum / graded.length) * 100);
}

/** strong ≥ 0.85 retrievability, weak < 0.6 or struggling, else medium. */
function masteryBucket(m: ItemMasteryRow): "strong" | "medium" | "weak" {
  const r = typeof m.retrievability === "number" ? m.retrievability : null;
  if (m.struggle_flag) return "weak";
  if (r == null) return "medium";
  if (r >= 0.85) return "strong";
  if (r < 0.6) return "weak";
  return "medium";
}

/** Resolve fc_card ids → topic labels via a dynamic import (no static dep). */
async function resolveFcCardLabels(
  ids: string[],
): Promise<Record<string, string | null>> {
  if (ids.length === 0) return {};
  try {
    const { fcService } = await import("@/features/flashcards/data/fcService");
    const res = await fcService.getTopicsForCardIds(ids);
    return res.data ?? {};
  } catch {
    return {};
  }
}

/**
 * Assemble the learner's cross-session memory from the study spine. Never
 * throws — a spine read failure degrades to whatever loaded (worst case
 * EMPTY_MEMORY), because the tutor must still answer without memory.
 */
export async function assembleLearnerMemory(
  opts: AssembleLearnerMemoryOptions = {},
): Promise<LearnerMemory> {
  const itemType = opts.itemType ?? DEFAULT_MEMORY_ITEM_TYPE;
  const windowDays = opts.windowDays ?? 21;
  const sessionLimit = opts.sessionLimit ?? 6;
  const weakLimit = opts.weakLimit ?? 6;
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

  const [
    sessionsRes,
    weakestRes,
    attemptsRes,
    masteryRes,
    streakRes,
    goalsRes,
  ] = await Promise.all([
    studyService.listSessions({ since, limit: sessionLimit }),
    studyService.listWeakest(itemType, 200),
    studyService.listAttempts(itemType, { since, limit: 1000 }),
    studyService.listMastery(itemType, 2000),
    studyService.getStreak(),
    studyService.listGoals({ status: "active" }),
  ]);

  const sessions = sessionsRes.data ?? [];
  const weakest = (weakestRes.data ?? []).slice(0, weakLimit);
  const attempts = attemptsRes.data ?? [];
  const mastery = masteryRes.data ?? [];
  const streakRow = streakRes.data;
  const goalRows = goalsRes.data ?? [];

  // Per-session accuracy rollups.
  const sessionIds = sessions.map((s) => s.id);
  const summariesRes =
    sessionIds.length > 0
      ? await studyService.getAttemptSummariesForSessions(sessionIds)
      : { data: {}, error: null };
  const summaries = summariesRes.data ?? {};

  const recentSessions: MemoryRecentSession[] = sessions.map((s) => ({
    mode: s.mode,
    when: s.started_at ?? s.created_at,
    accuracyPct: summaries[s.id]?.avgScorePct ?? null,
    total: summaries[s.id]?.total ?? 0,
  }));

  // Weak-area labels (topics for fc_card).
  const labelMap =
    itemType === "fc_card"
      ? await resolveFcCardLabels(weakest.map((w) => w.item_id))
      : {};
  const weakAreas: MemoryWeakArea[] = weakest.map((w) => ({
    label: labelMap[w.item_id] || w.item_id,
    itemType: w.item_type,
    itemId: w.item_id,
    retrievability:
      typeof w.retrievability === "number" ? w.retrievability : null,
    struggle: !!w.struggle_flag,
  }));

  const masteryDistribution = mastery.reduce(
    (acc, m) => {
      acc[masteryBucket(m)] += 1;
      return acc;
    },
    { strong: 0, medium: 0, weak: 0 },
  );

  const goals: MemoryGoal[] = goalRows.map((g) => {
    const meta = (g.metadata ?? {}) as { itemType?: string; topic?: string };
    return {
      title: g.title,
      targetDate: g.target_date,
      daysUntil: daysUntil(g.target_date),
      itemType: meta.itemType,
      topic: meta.topic,
    };
  });

  const windowAccuracyPct = windowAccuracy(attempts);

  const hasData =
    sessions.length > 0 ||
    attempts.length > 0 ||
    mastery.length > 0 ||
    !!streakRow;

  if (!hasData) return EMPTY_MEMORY;

  return {
    hasData,
    streak: streakRow
      ? { current: streakRow.current_streak, longest: streakRow.longest_streak }
      : null,
    recentSessions,
    weakAreas,
    windowAccuracyPct,
    masteryDistribution,
    goals,
    summaryText: buildSummaryText({
      streak: streakRow
        ? {
            current: streakRow.current_streak,
            longest: streakRow.longest_streak,
          }
        : null,
      recentSessions,
      weakAreas,
      windowAccuracyPct,
      masteryDistribution,
      goals,
      windowDays,
    }),
  };
}

/** Compose the compact natural-language memory block for context injection. */
function buildSummaryText(m: {
  streak: { current: number; longest: number } | null;
  recentSessions: MemoryRecentSession[];
  weakAreas: MemoryWeakArea[];
  windowAccuracyPct: number | null;
  masteryDistribution: { strong: number; medium: number; weak: number };
  goals: MemoryGoal[];
  windowDays: number;
}): string {
  const lines: string[] = [];

  if (m.recentSessions.length > 0) {
    const acc =
      m.windowAccuracyPct != null ? `, averaging ${m.windowAccuracyPct}% accuracy` : "";
    lines.push(
      `In the last ${m.windowDays} days the learner has completed ${m.recentSessions.length} study session(s)${acc}.`,
    );
  } else {
    lines.push("The learner has not studied in the last few weeks.");
  }

  if (m.streak && m.streak.current > 0) {
    lines.push(
      `Current study streak: ${m.streak.current} day(s) (personal best ${m.streak.longest}).`,
    );
  }

  const { strong, medium, weak } = m.masteryDistribution;
  if (strong + medium + weak > 0) {
    lines.push(
      `Mastery across studied items: ${strong} strong, ${medium} developing, ${weak} weak.`,
    );
  }

  if (m.weakAreas.length > 0) {
    const labels = Array.from(
      new Set(m.weakAreas.map((w) => w.label).filter(Boolean)),
    ).slice(0, 6);
    if (labels.length > 0) {
      lines.push(`Weakest areas right now: ${labels.join(", ")}.`);
    }
  }

  const datedGoals = m.goals
    .filter((g) => g.daysUntil != null)
    .sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0));
  if (datedGoals.length > 0) {
    const g = datedGoals[0];
    const when =
      g.daysUntil! < 0
        ? "(past due)"
        : g.daysUntil === 0
          ? "today"
          : `in ${g.daysUntil} day(s)`;
    lines.push(`Upcoming goal: "${g.title}" ${when}.`);
  }

  return lines.join(" ");
}
