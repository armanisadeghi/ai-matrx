"use client";

// features/education/home/snapshot.ts
//
// ONE read for the whole Education home.
//
// Every block on the page draws from this single snapshot, gathered in one
// parallel pass. That is the reason the page can rank its blocks by live signal
// at all: a per-block fetch would mean the ranking runs before the data it
// ranks on has arrived, and the page would reflow as each block discovered
// whether it had anything to say.
//
// Nothing here throws. A learner's home must render even when one lane is
// unavailable — a failed kit scan costs the kits block, never the page.

import { CalendarClock, Flame, Target } from "lucide-react";
import { listKits } from "../kits/kitService";
import {
  fetchEducationLibraryFacets,
  fetchEducationLibraryPage,
} from "../library/service";
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";
import { blockHref, blockIcon } from "../study/planner/blockLinks";
import {
  dueWeakByMode,
  modeReviewHref,
  modeWeakHref,
} from "../study/dashboard/nextActions";
import { planService } from "../study/service/planService";
import { studyService } from "../study/service/studyService";
import type { StudyPlanBlockRow } from "../study/planner/types";
import type { StudyGoalRow } from "../study/types";
import type { EducationSnapshot, NextAction } from "./types";

/** How many artifacts / kits the home shows before deferring to the library. */
const RECENT_LIMIT = 8;
const KIT_LIMIT = 6;

/** Rough minutes per item, used only to set expectations on a next action. */
const MIN_PER_REVIEW = 0.6;
const MIN_PER_WEAK = 1.2;

/** A goal this many days out or nearer is worth interrupting the page for. */
const GOAL_HORIZON_DAYS = 30;

function todayIso(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function daysUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const target = new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return Math.round((target - midnight.getTime()) / 86_400_000);
}

function nearestDatedGoal(goals: StudyGoalRow[]): StudyGoalRow | null {
  const dated = goals
    .filter((g) => g.target_date)
    .sort((a, b) => (a.target_date ?? "").localeCompare(b.target_date ?? ""));
  return dated[0] ?? null;
}

/**
 * The ranked "what should I do right now" list.
 *
 * Order is deliberate and is the product's opinion, not a sort: the learner's
 * OWN plan for today outranks anything the system infers, because a plan they
 * made is a commitment and overriding it teaches them the plan is decorative.
 * Only when the plan has nothing pending does the live spine (due, then weak)
 * get to speak. A near-term goal is appended as context in either case.
 *
 * Pure over injected `now` so it is testable and so a single render cannot see
 * two different "today"s.
 */
export function buildNextActions(input: {
  todayBlocks: StudyPlanBlockRow[];
  isRestDay: boolean;
  modes: ReturnType<typeof dueWeakByMode>;
  goals: StudyGoalRow[];
  now: Date;
}): NextAction[] {
  const { todayBlocks, isRestDay, modes, goals, now } = input;
  const built: NextAction[] = [];

  for (const b of todayBlocks) {
    built.push({
      key: `block-${b.id}`,
      icon: blockIcon(b.target_kind),
      label: b.label,
      why: b.rationale ?? "From your study plan for today.",
      minutes: b.estimated_minutes,
      href: blockHref(
        b.target_kind,
        (b.target_ref as { topic?: string } | null) ?? null,
      ),
    });
  }

  if (built.length === 0 && !isRestDay) {
    for (const sig of modes) {
      if (sig.due > 0) {
        built.push({
          key: `due-${sig.itemType}`,
          icon: CalendarClock,
          label: `${sig.label}: review ${sig.due} due`,
          why: "Reviewing right as items come due is what makes spaced repetition work.",
          minutes: Math.max(1, Math.round(sig.due * MIN_PER_REVIEW)),
          href: modeReviewHref(sig.itemType),
        });
      }
      if (sig.weak > 0) {
        built.push({
          key: `weak-${sig.itemType}`,
          icon: Flame,
          label: `${sig.label}: drill ${sig.weak} weak`,
          why: "The smallest set of material causing the most errors — biggest gain per minute.",
          minutes: Math.max(1, Math.round(sig.weak * MIN_PER_WEAK)),
          href: modeWeakHref(sig.itemType),
        });
      }
    }
  }

  const urgent = nearestDatedGoal(goals);
  if (urgent) {
    const days = daysUntil(urgent.target_date, now);
    if (days != null && days >= 0 && days <= GOAL_HORIZON_DAYS) {
      built.push({
        key: `goal-${urgent.id}`,
        icon: Target,
        label: urgent.title,
        why:
          days === 0
            ? "Target is today."
            : `${days} day${days === 1 ? "" : "s"} to your target.`,
        minutes: null,
        href: "/education/planner",
      });
    }
  }

  return built.slice(0, 4);
}

/** Facet rows → a plain count map, tolerating a missing facet. */
function countsFor(
  byKind: Record<string, { value: string; count: number }[]>,
  facet: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of byKind[facet] ?? []) out[entry.value] = entry.count;
  return out;
}

/** Log and swallow — one dead lane must never cost the learner the page. */
async function lane<T>(name: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[education/home] ${name} failed:`, error);
    return fallback;
  }
}

export async function loadEducationSnapshot(
  now = new Date(),
): Promise<EducationSnapshot> {
  const listQuery = {
    ...DEFAULT_ENTITY_LIST_QUERY,
    scope: { kind: "mine" as const },
    page: 1,
  };

  const [recentPage, facets, kits, planRes, masteryRes, goalsRes, streakRes] =
    await Promise.all([
      lane(
        "library page",
        () =>
          fetchEducationLibraryPage(listQuery, {
            sort: "created",
            direction: "desc",
            favoritesFirst: false,
            pageSize: RECENT_LIMIT,
          }),
        { rows: [], total: 0 },
      ),
      lane("library facets", () => fetchEducationLibraryFacets(listQuery), {
        byKind: {},
      }),
      lane("kits", () => listKits(), []),
      lane("plan", () => planService.getActivePlan(), { data: null, error: null }),
      lane("mastery", () => studyService.listAllMastery(), {
        data: [],
        error: null,
      }),
      lane("goals", () => studyService.listGoals({ status: "active" }), {
        data: [],
        error: null,
      }),
      lane("streak", () => studyService.getStreak(), { data: null, error: null }),
    ]);

  const mastery = masteryRes.data ?? [];
  const goals = goalsRes.data ?? [];
  const plan = planRes.data ?? null;
  const modes = dueWeakByMode(mastery, now);

  const todayEntry = plan?.days.find((d) => d.day.day_date === todayIso(now));
  const isRestDay = !!todayEntry?.day.is_rest_day;
  const todayBlocks = isRestDay
    ? []
    : (todayEntry?.blocks ?? []).filter((b) => b.status === "pending");

  return {
    library: {
      total: recentPage.total,
      recent: recentPage.rows,
      byKind: countsFor(facets.byKind, "kind"),
      bySubtype: countsFor(facets.byKind, "subtype"),
    },
    kits: { total: kits.length, recent: kits.slice(0, KIT_LIMIT) },
    study: {
      plan,
      todayBlocks,
      isRestDay,
      goals,
      streakDays: streakRes.data?.current_streak ?? 0,
      modes,
      totalDue: modes.reduce((sum, m) => sum + m.due, 0),
      totalWeak: modes.reduce((sum, m) => sum + m.weak, 0),
      hasStudied: mastery.some((m) => (m.attempt_count ?? 0) > 0),
    },
    nextActions: buildNextActions({ todayBlocks, isRestDay, modes, goals, now }),
  };
}
