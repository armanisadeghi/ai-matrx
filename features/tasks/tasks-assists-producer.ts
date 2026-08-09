/**
 * Deterministic Assists producer for Tasks — the "overdue pileup" noticer.
 * When enough open, unsnoozed tasks are past their due date, one chip offers
 * the Task Triage Assistant pre-filled with the exact list (titles, due
 * dates, priorities), so working through the backlog is a review-and-send
 * instead of a scroll.
 *
 * Producer rules honored (features/assists/FEATURE.md):
 * - one dedupe key per user; `filterUndecidedKeys` first so a dismissal is
 *   durable — re-noticing never resurrects the chip.
 * - capped: at most ONE chip per sweep (the pileup aggregates), expires set.
 * - cheapest-first: pure reads over the already-hydrated Redux task store
 *   (session-boot full context + per-user snooze state); zero fetches,
 *   zero tokens to notice. Snoozed tasks never count — a snooze is the
 *   user saying "not now", and the chip must respect it.
 * - the action is real: launches the `tasks.triage_assistant` agent slot
 *   (swappable from /agents/slots, no deploy) with the triage brief ready.
 *
 * System-of-record: /Users/armanisadeghi/code/common-docs/systems/assists/FEATURE.md
 */

import type { AppDispatch } from "@/lib/redux/store";
import { filterUndecidedKeys } from "@/features/assists/service";
import { emitAssistTracked } from "@/features/assists/redux/emitTracked";
import type { TaskWithProject } from "@/features/tasks/types";
import { UNASSIGNED_PROJECT_ID } from "@/features/tasks/redux/selectors";

const SOURCE_KEY = "tasks.overdue_pileup";

/** `/tasks` resolves to this surface (features/surfaces/utils/route-to-surface.ts). */
export const TASKS_ASSIST_SURFACE = "matrx-user/tasks";

/** Agent-slot the launch action resolves at click time (agent.slot_definition,
 * seeded by migrations/agent_slots_assist_producers_seed.sql — swappable from
 * the admin slots console, no deploy). */
export const TASK_TRIAGE_SLOT = "tasks.triage_assistant";

// Conservative threshold — one or two overdue tasks is a normal Tuesday;
// a pileup is the signal ("loud, never nagging").
const MIN_OVERDUE = 3;
const MAX_LISTED = 12;
const EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

function taskLine(t: TaskWithProject): string {
  const parts = [`- ${t.title} — due ${t.dueDate}`];
  if (t.priority) parts.push(`${t.priority} priority`);
  if (t.projectId && t.projectId !== UNASSIGNED_PROJECT_ID) {
    parts.push(`project: ${t.projectName}`);
  }
  return parts.join(", ");
}

/**
 * One sweep per session once the threshold is met (the strip gates it).
 * Emits at most one assist. Returns true when the threshold was met (the
 * caller may stop re-checking this session) — false means "not enough yet,
 * keep watching"; no network is touched below the threshold.
 */
export async function produceTaskAssists(args: {
  userId: string;
  /** Open (not completed/cancelled/dismissed), unsnoozed tasks past their
   * due date — computed by the caller from already-loaded Redux state. */
  overdue: TaskWithProject[];
  dispatch: AppDispatch;
}): Promise<boolean> {
  const { userId, overdue, dispatch } = args;
  if (overdue.length < MIN_OVERDUE) return false;

  const dedupeKey = `${SOURCE_KEY}:${userId}`;
  const undecided = await filterUndecidedKeys([dedupeKey]);
  if (undecided.length === 0) return true;

  const count = overdue.length;
  const listed = overdue.slice(0, MAX_LISTED);
  const overflow = count - listed.length;
  const draftText = [
    `I have ${count} tasks past their due date and need help working through them.`,
    "",
    "Overdue tasks (title — due date):",
    ...listed.map(taskLine),
    ...(overflow > 0 ? [`…and ${overflow} more overdue tasks.`] : []),
    "",
    "Help me triage: which should I do first, which should move to a realistic new date, and which look finished or no longer worth doing? You can read and update my tasks directly — propose the plan, then apply the changes I agree to.",
  ].join("\n");

  await emitAssistTracked(
    userId,
    {
      sourceKey: SOURCE_KEY,
      title: `Catch up on ${count} overdue tasks`,
      body: `${count} open tasks are past their due date (snoozed ones aren't counted). One click opens the Task Triage Assistant with the full list ready; it proposes what to do first, what to reschedule, and what to close — and applies only what you agree to.`,
      action: {
        kind: "launch_agent",
        slotKey: TASK_TRIAGE_SLOT,
        agentName: "Task Triage Assistant",
        draftText,
      },
      surfaceName: TASKS_ASSIST_SURFACE,
      dedupeKey,
      expiresAt: new Date(Date.now() + EXPIRES_MS).toISOString(),
      priority: 10,
    },
    dispatch,
  );
  return true;
}
