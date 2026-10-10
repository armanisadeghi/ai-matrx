// features/employee-performance-reviews/standard/goals.ts
//
// GOALS (HR-REVIEWS wave 3): the wire shapes of the hr_goal_* doors, their parsers, and the pure
// display logic — progress words, status tones, and the alignment tree (a goal under the goal it
// supports, an orphaned parent shown as a root rather than dropped).

import { isRec } from "./types";

export type GoalStatus = "on_track" | "at_risk" | "off_track" | "done" | "dropped";
export const GOAL_STATUSES: GoalStatus[] = ["on_track", "at_risk", "off_track", "done", "dropped"];

export interface Goal {
  goalId: string;
  employmentId: string;
  ownerName: string;
  title: string;
  description: string | null;
  measure: string | null;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  startOn: string | null;
  dueOn: string | null;
  status: GoalStatus;
  progress: number;
  parentGoalId: string | null;
  cycleId: string | null;
  childCount: number;
}

export interface GoalHistoryEntry {
  at: string | null;
  currentValue: number | null;
  progress: number | null;
  status: string | null;
  note: string | null;
}

export interface TeamMember {
  employmentId: string;
  name: string;
  canEdit: boolean;
  goals: Goal[];
}

type Rec = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const recs = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRec) : []);

export function parseGoal(g: Rec): Goal | null {
  const goalId = str(g.goal_id);
  if (!goalId) return null;
  const status = str(g.status);
  return {
    goalId,
    employmentId: str(g.employment_id) ?? "",
    ownerName: str(g.owner_name) ?? "Employee",
    title: str(g.title) ?? "Goal",
    description: str(g.description),
    measure: str(g.measure),
    targetValue: num(g.target_value),
    currentValue: num(g.current_value),
    unit: str(g.unit),
    startOn: str(g.start_on),
    dueOn: str(g.due_on),
    status: (GOAL_STATUSES as string[]).includes(status ?? "") ? (status as GoalStatus) : "on_track",
    progress: num(g.progress) ?? 0,
    parentGoalId: str(g.parent_goal_id),
    cycleId: str(g.cycle_id),
    childCount: num(g.child_count) ?? 0,
  };
}

export const parseGoals = (v: unknown): Goal[] => recs(v).map(parseGoal).filter((g): g is Goal => g !== null);

export function parseTeam(raw: Rec): TeamMember[] {
  return recs(raw.members).flatMap((m) => {
    const employmentId = str(m.employment_id);
    return employmentId ? [{ employmentId, name: str(m.name) ?? "Employee", canEdit: m.can_edit === true, goals: parseGoals(m.goals) }] : [];
  });
}

export function parseGoalHistory(v: unknown): GoalHistoryEntry[] {
  return recs(v).map((h) => ({ at: str(h.at), currentValue: num(h.current_value), progress: num(h.progress), status: str(h.status), note: str(h.note) }));
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  done: "Done",
  dropped: "Dropped",
};

export const GOAL_STATUS_TONE: Record<GoalStatus, "success" | "warning" | "destructive" | "primary" | "neutral"> = {
  on_track: "success",
  at_risk: "warning",
  off_track: "destructive",
  done: "primary",
  dropped: "neutral",
};

const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

/** "62% (31 of 50 deals)" when a numeric target exists, otherwise "62%". Progress is clamped to 0-100. */
export function progressLabel(g: Pick<Goal, "progress" | "currentValue" | "targetValue" | "unit">): string {
  const pct = `${trim(Math.min(100, Math.max(0, g.progress)))}%`;
  if (g.targetValue === null) return pct;
  const unit = g.unit ? ` ${g.unit}` : "";
  return `${pct} (${trim(g.currentValue ?? 0)} of ${trim(g.targetValue)}${unit})`;
}

export interface GoalNode {
  goal: Goal;
  depth: number;
}

/**
 * Goals in alignment order: each goal directly under the goal it supports, children sorted by due date
 * then title. A goal whose parent is not in `goals` (someone else's, archived) is a root, never lost.
 * A cycle in the data (the door refuses them, but data can predate that) is broken at the second visit.
 */
export function alignmentRows(goals: Goal[]): GoalNode[] {
  const ids = new Set(goals.map((g) => g.goalId));
  const byParent = new Map<string | null, Goal[]>();
  for (const g of goals) {
    const key = g.parentGoalId && ids.has(g.parentGoalId) && g.parentGoalId !== g.goalId ? g.parentGoalId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), g]);
  }
  const order = (a: Goal, b: Goal) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || a.title.localeCompare(b.title);
  const out: GoalNode[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const g of [...(byParent.get(parent) ?? [])].sort(order)) {
      if (seen.has(g.goalId)) continue;
      seen.add(g.goalId);
      out.push({ goal: g, depth });
      walk(g.goalId, depth + 1);
    }
  };
  walk(null, 0);
  // anything unreached sits in a loop: show it as a root rather than hide it
  for (const g of goals) if (!seen.has(g.goalId)) out.push({ goal: g, depth: 0 });
  return out;
}

/** The goals a goal could be aligned UNDER: not itself and nothing below it. */
export function parentChoices(goals: Goal[], goalId: string | null): Goal[] {
  if (!goalId) return goals;
  const below = new Set<string>([goalId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of goals) {
      if (g.parentGoalId && below.has(g.parentGoalId) && !below.has(g.goalId)) {
        below.add(g.goalId);
        grew = true;
      }
    }
  }
  return goals.filter((g) => !below.has(g.goalId));
}
