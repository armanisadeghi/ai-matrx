/**
 * The notice a super-admin reads when a system schedule needs a human — the
 * PURE half of `SystemScheduleAlarmBanner`.
 *
 * THE DEFECT THIS EXISTS FOR (2026-09-11). `scheduler.system_schedule_alarms`
 * worked, `fetchSystemScheduleAlarms` worked, and the scanner-health page
 * rendered six critical alarms perfectly — for seventeen days, to nobody,
 * because the only place they rendered was a page you open when you already
 * suspect the problem. An alarm that requires you to already suspect the
 * problem is a report. This model turns the same rows into the one sentence
 * a person sees on every page until the schedules are back on.
 *
 * Pure so the negative case is provable without mutating live schedules:
 * an empty alarm list yields `null`, and `null` renders nothing.
 */

import type { SystemScheduleAlarm } from "../service/queries";

export const SCANNER_HEALTH_HREF =
  "/administration/automation/scheduling/scanner-health";

/** The record route for a scheduled task — the door where re-enabling lives. */
export function scheduleHref(taskId: string): string {
  return `/schedules/${taskId}`;
}

export interface SystemScheduleAlarmNotice {
  /** `destructive` while any alarm is critical; `warning` otherwise. */
  tone: "destructive" | "warning";
  title: string;
  /** What is at stake and what to do — one sentence, no jargon. */
  description: string;
  /** Every alarming schedule, worst first, each with its own door. */
  items: Array<{
    taskId: string;
    title: string;
    href: string;
    /** Short human label for the alarm kind. */
    state: string;
    severity: SystemScheduleAlarm["severity"];
  }>;
  criticalCount: number;
  warningCount: number;
}

const STATE_LABEL: Record<SystemScheduleAlarm["alarm"], string> = {
  suspended: "switched off",
  overdue: "overdue",
  failing: "failing",
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Build the notice, or `null` when there is nothing to say. `null` is the
 * ONLY honest answer for an empty list — a banner that says "all clear"
 * on every page is wallpaper, and wallpaper is how the next alarm gets missed.
 */
export function buildSystemScheduleAlarmNotice(
  alarms: readonly SystemScheduleAlarm[],
): SystemScheduleAlarmNotice | null {
  if (alarms.length === 0) return null;

  const critical = alarms.filter((a) => a.severity === "critical");
  const warning = alarms.filter((a) => a.severity !== "critical");
  const ordered = [...critical, ...warning];

  const items = ordered.map((alarm) => ({
    taskId: alarm.task_id,
    title: alarm.title,
    href: scheduleHref(alarm.task_id),
    state: STATE_LABEL[alarm.alarm],
    severity: alarm.severity,
  }));

  if (critical.length > 0) {
    const only = critical.length === 1 ? critical[0] : null;
    return {
      tone: "destructive",
      title: only
        ? `"${only.title}" is switched off and nothing will run it until a person turns it back on.`
        : `${plural(critical.length, "scheduled job is", "scheduled jobs are")} switched off and nothing will run them until a person turns them back on.`,
      description:
        warning.length > 0
          ? `The repeat guard suspended ${critical.length === 1 ? "it" : "them"} after repeated failures. ${plural(warning.length, "more schedule is", "more schedules are")} overdue or failing. Open a schedule to see why and re-enable it, or review them all.`
          : `The repeat guard suspended ${critical.length === 1 ? "it" : "them"} after repeated failures. Open a schedule to see why and re-enable it, or review them all.`,
      items,
      criticalCount: critical.length,
      warningCount: warning.length,
    };
  }

  const only = warning.length === 1 ? warning[0] : null;
  return {
    tone: "warning",
    title: only
      ? `"${only.title}" is ${STATE_LABEL[only.alarm]}.`
      : `${plural(warning.length, "scheduled job is", "scheduled jobs are")} overdue or failing.`,
    description:
      "Still enabled, but the last run failed or the due time passed without a run. Open a schedule to see the error, or review them all.",
    items,
    criticalCount: 0,
    warningCount: warning.length,
  };
}
