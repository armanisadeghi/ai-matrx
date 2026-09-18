/**
 * Schedule alarms as attention items — the PURE half of the schedule source.
 *
 * Every row of `scheduler.system_schedule_alarms` becomes a decision a person
 * can make from the card: open the schedule (record door), open the run that
 * failed (evidence door), open the product pages it feeds (impact doors, or an
 * honest "hasn't said which pages it feeds"), re-enable it, or mute THIS
 * schedule for a while with a note that every super-admin sees.
 *
 * Pure: the writes are injected, so the rows → items mapping is unit-tested
 * against fixtures shaped exactly like the RPC's output, and the negative
 * case (a muted row stays a row, with its mute) is provable offline.
 */

import type { SystemScheduleAlarm } from "@/features/scheduling/service/queries";
import { humanizeRelative } from "@/features/scheduling/utils/triggerHumanize";
import type { AttentionItem } from "../types";

export const SCHEDULE_ALARM_SOURCE_ID = "schedule-alarms";
export const SCHEDULE_ALARM_SOURCE_LABEL = "Schedules";
export const SCHEDULE_REVIEW_HREF = "/administration/automation/scheduling/scanner-health";

/** The record route for a scheduled task — the door where re-enabling lives. */
export function scheduleHref(taskId: string): string {
  return `/schedules/${taskId}`;
}

export interface ScheduleAlarmDeps {
  reenable: (row: SystemScheduleAlarm) => Promise<void>;
  mute: (taskId: string, untilIso: string, note: string | null) => Promise<void>;
  unmute: (taskId: string) => Promise<void>;
  now?: number;
}

function stateOf(row: SystemScheduleAlarm): string {
  switch (row.alarm) {
    case "suspended":
      return row.suspended_at
        ? `switched off ${humanizeRelative(row.suspended_at)}`
        : "switched off";
    case "overdue":
      return row.next_due_at ? `overdue since ${humanizeRelative(row.next_due_at)}` : "overdue";
    case "failing":
      return `${row.failed_streak} runs failed in a row`;
  }
}

function reenableConfirm(row: SystemScheduleAlarm): NonNullable<AttentionItem["actions"][number]["confirm"]> {
  const overdue = row.next_due_at !== null && new Date(row.next_due_at).getTime() < Date.now();
  const failures = row.consecutive_failures;
  return {
    title: row.kind === "tool" ? "Re-enable this system schedule?" : "Re-enable this schedule?",
    description: [
      row.kind === "tool"
        ? "Turns the schedule and its trigger back on together."
        : "Turns the schedule back on.",
      row.succeeded_since_suspension
        ? "A run has already succeeded since the guard switched it off, so the cause looks fixed."
        : "",
      overdue
        ? `It was due ${humanizeRelative(row.next_due_at)}, so the scanner will run it on its next pass — within about a minute.`
        : row.next_due_at
          ? `Its next run stays at ${humanizeRelative(row.next_due_at)}.`
          : "",
      typeof failures === "number"
        ? `If the cause is not fixed, the repeat guard will switch it off again after ${failures} more matching failures.`
        : "If the cause is not fixed, the repeat guard will switch it off again.",
      row.approval
        ? `This restores the existing approval (${row.approval}) — it is not a new schedule and needs no new sign-off.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    confirmLabel: row.approval ? "Re-enable and restore approval" : "Re-enable",
    variant: "default",
  };
}

export function scheduleAlarmItems(
  rows: readonly SystemScheduleAlarm[],
  deps: ScheduleAlarmDeps,
): AttentionItem[] {
  const now = deps.now ?? Date.now();
  return rows.map((row) => {
    const doors: AttentionItem["doors"] = [];
    if (row.last_run_id && row.last_run_status === "failed") {
      doors.push({
        kind: "evidence",
        href: `${scheduleHref(row.task_id)}#run-${row.last_run_id}`,
        label: "The run that failed",
        what: row.last_run_error ?? undefined,
      });
    }
    for (const impact of row.impact ?? []) {
      doors.push({ kind: "impact", href: impact.href, label: impact.label, what: impact.what });
    }

    const actions: AttentionItem["actions"] = [];
    if (row.alarm === "suspended") {
      actions.push({
        id: "reenable",
        label: row.approval ? "Re-enable and restore approval" : "Re-enable",
        variant: "default",
        confirm: reenableConfirm(row),
        run: () => deps.reenable(row),
      });
    }

    const mutedUntilMs = row.muted_until ? new Date(row.muted_until).getTime() : NaN;
    const current =
      Number.isFinite(mutedUntilMs) && mutedUntilMs > now
        ? { until: row.muted_until as string, reason: row.mute_reason, by: row.mute_by }
        : null;

    return {
      key: `${SCHEDULE_ALARM_SOURCE_ID}:${row.task_id}`,
      sourceId: SCHEDULE_ALARM_SOURCE_ID,
      id: row.task_id,
      severity: row.severity,
      title: row.title,
      state: stateOf(row),
      sentence: row.detail,
      about: row.description,
      record: { token: "sch_task", id: row.task_id, href: scheduleHref(row.task_id) },
      doors,
      impactDeclared: Boolean(row.impact && row.impact.length > 0),
      actions,
      mute: {
        scope: "server",
        current,
        apply: (untilMs, note) => deps.mute(row.task_id, new Date(untilMs).toISOString(), note),
        clear: () => deps.unmute(row.task_id),
      },
    };
  });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 scheduled jobs are switched off and 1 is failing or overdue." */
export function summarizeScheduleAlarms(items: readonly AttentionItem[]): string | null {
  if (items.length === 0) return null;
  const off = items.filter((i) => i.state.startsWith("switched off")).length;
  const rest = items.length - off;
  const parts: string[] = [];
  if (off > 0) {
    parts.push(
      `${plural(off, "scheduled job is", "scheduled jobs are")} switched off and nothing will run ${off === 1 ? "it" : "them"} until a person turns ${off === 1 ? "it" : "them"} back on`,
    );
  }
  if (rest > 0) {
    parts.push(
      off > 0
        ? `${rest} more ${rest === 1 ? "is" : "are"} failing or overdue`
        : `${plural(rest, "scheduled job is", "scheduled jobs are")} failing or overdue`,
    );
  }
  return `${parts.join("; ")}.`;
}
