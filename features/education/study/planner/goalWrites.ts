// features/education/study/planner/goalWrites.ts
//
// The ONE canonical authoring path for `education.study_goal`, shared by the
// human UI (StudyPlanner's editor dialog) and the agent write handlers on the
// `matrx-user/education-planner` surface. Both callers land here so there is no
// parallel write path — the agent writes exactly what a click writes.
//
// These functions THROW on a bad shape or a service error; `studyService`
// itself never throws (it returns `{ data, error }`), so the throw is added
// here deliberately:
//   - the surface writeback seam converts a throw into the safe error envelope
//     the agent reads back (features/surfaces/runtime/surface-writeback.ts);
//   - the UI catches and toasts, exactly as it did when the call was inline.
//
// Deletion is NOT here and must not be: destructive actions stay human, so the
// planner surface declares no delete target and there is no shared helper an
// agent path could reach for.

import { studyService } from "../service/studyService";
import { GOAL_STATUSES } from "../types";
import type { GoalStatus, StudyGoalMetadata, StudyGoalRow } from "../types";

/** Matches the `study_goal.target_date` DATE column exactly. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What both the editor dialog and the agent supply to author a goal. */
export interface GoalAuthorInput {
  title: string;
  /** `YYYY-MM-DD`, or null for an open-ended goal. */
  targetDate?: string | null;
  /** Free-form topic tag matching a flashcard topic; empty/undefined = untargeted. */
  topic?: string | null;
}

/**
 * Normalize a target date to the `YYYY-MM-DD` the DATE column stores. Empty
 * string and null both mean "no target date". Throws on anything else so a
 * malformed date is the caller's error to hear about, never a silent null.
 */
export function normalizeGoalTargetDate(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!ISO_DATE.test(trimmed))
    throw new Error(
      `target_date must be a calendar date formatted YYYY-MM-DD (e.g. "2026-09-14"); received "${trimmed}".`,
    );
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()))
    throw new Error(`target_date "${trimmed}" is not a real calendar date.`);
  return trimmed;
}

function requireTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed)
    throw new Error(
      "A goal needs a non-empty title — plain text, not JSON and not a JSON-encoded string, no code fence.",
    );
  return trimmed;
}

/**
 * Targeting rides in `metadata` rather than dedicated columns (see
 * `StudyGoalMetadata`). `itemType` is pinned to 'fc_card' because that is the
 * only item_type the planner's progress join resolves today — the same value
 * the editor dialog writes.
 */
function goalMetadata(topic: string | null | undefined): StudyGoalMetadata {
  const trimmed = topic?.trim();
  return trimmed ? { itemType: "fc_card", topic: trimmed } : { itemType: "fc_card" };
}

/** Assert a status against the live vocabulary constant, never a retyped literal. */
export function assertGoalStatus(value: unknown): GoalStatus {
  if (typeof value !== "string" || !GOAL_STATUSES.includes(value as GoalStatus))
    throw new Error(
      `status must be one of ${GOAL_STATUSES.join(" | ")}; received ${JSON.stringify(value)}.`,
    );
  return value as GoalStatus;
}

/**
 * A goal id that does not resolve is the most likely agent mistake, so the
 * error carries the CURRENTLY active goals — read fresh here, at call time, not
 * from a render closure that may have gone stale while a confirm dialog sat
 * open.
 */
async function describeAvailableGoals(): Promise<string> {
  const res = await studyService.listGoals({ status: "active" });
  const goals = res.data ?? [];
  if (goals.length === 0)
    return " There are no active goals on this page right now.";
  return ` Active goals right now: ${goals
    .map((g) => `${g.id} ("${g.title}")`)
    .join(", ")}.`;
}

export async function createStudyGoal(
  input: GoalAuthorInput,
): Promise<StudyGoalRow> {
  const res = await studyService.createGoal({
    title: requireTitle(input.title),
    targetDate: normalizeGoalTargetDate(input.targetDate),
    metadata: goalMetadata(input.topic),
  });
  if (res.error || !res.data)
    throw new Error(res.error ?? "Creating the goal failed.");
  return res.data;
}

/**
 * Patch an existing goal. Only the fields present in `input` are written, so a
 * caller changing just the date cannot blank the title. `topic` is part of the
 * metadata blob, so supplying it rewrites the whole targeting object — pass an
 * empty string to clear the topic.
 */
export async function updateStudyGoal(
  goalId: string,
  input: Partial<GoalAuthorInput>,
): Promise<StudyGoalRow> {
  if (typeof goalId !== "string" || !goalId.trim())
    throw new Error("goal_id is required — it says WHICH goal to change.");

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = requireTitle(input.title);
  if (input.targetDate !== undefined)
    patch.target_date = normalizeGoalTargetDate(input.targetDate);
  if (input.topic !== undefined) patch.metadata = goalMetadata(input.topic);

  if (Object.keys(patch).length === 0)
    throw new Error(
      "Nothing to change — supply at least one of title, target_date or topic alongside goal_id.",
    );

  const res = await studyService.updateGoal(goalId.trim(), patch);
  if (res.error || !res.data)
    throw new Error(
      `${res.error ?? `No goal matched id "${goalId}".`}${await describeAvailableGoals()}`,
    );
  return res.data;
}

/** Move a goal through its lifecycle (active / achieved / archived). */
export async function setStudyGoalStatus(
  goalId: string,
  status: GoalStatus,
): Promise<StudyGoalRow> {
  if (typeof goalId !== "string" || !goalId.trim())
    throw new Error("goal_id is required — it says WHICH goal to change.");
  const res = await studyService.updateGoal(goalId.trim(), {
    status: assertGoalStatus(status),
  });
  if (res.error || !res.data)
    throw new Error(
      `${res.error ?? `No goal matched id "${goalId}".`}${await describeAvailableGoals()}`,
    );
  return res.data;
}
