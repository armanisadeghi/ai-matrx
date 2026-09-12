import type { SystemScheduleAlarm } from "../service/queries";
import {
  buildSystemScheduleAlarmNotice,
  SCANNER_HEALTH_HREF,
} from "./system-schedule-alarm-notice";

function alarm(over: Partial<SystemScheduleAlarm>): SystemScheduleAlarm {
  return {
    task_id: "00000000-0000-4000-8000-000000000001",
    title: "A job",
    alarm: "suspended",
    severity: "critical",
    detail: "has failed 3 times",
    enabled: false,
    next_due_at: null,
    last_run_at: null,
    suspended_at: "2026-08-29T00:00:00Z",
    consecutive_failures: 3,
    ...over,
  };
}

describe("buildSystemScheduleAlarmNotice", () => {
  // THE NEGATIVE CASE — the banner's whole honesty rests on this: nothing to
  // report renders nothing. Proven here, not by switching a live schedule off.
  it("returns null when the RPC reports nothing", () => {
    expect(buildSystemScheduleAlarmNotice([])).toBeNull();
  });

  it("names every suspended schedule with its own door, worst first", () => {
    const rows = [
      alarm({ task_id: "id-warn", title: "Overdue one", alarm: "overdue", severity: "warning", enabled: true }),
      alarm({ task_id: "id-1", title: "SEO — universal facet backfill" }),
      alarm({ task_id: "id-2", title: "Commerce intake sweep" }),
    ];
    const notice = buildSystemScheduleAlarmNotice(rows);
    expect(notice).not.toBeNull();
    expect(notice!.tone).toBe("destructive");
    expect(notice!.criticalCount).toBe(2);
    expect(notice!.warningCount).toBe(1);
    expect(notice!.title).toBe(
      "2 scheduled jobs are switched off and nothing will run them until a person turns them back on.",
    );
    expect(notice!.description).toContain("1 more schedule is overdue or failing");
    expect(notice!.items.map((i) => i.taskId)).toEqual(["id-1", "id-2", "id-warn"]);
    expect(notice!.items[0]!.href).toBe("/schedules/id-1");
    expect(notice!.items[0]!.state).toBe("switched off");
    expect(notice!.items[2]!.state).toBe("overdue");
    expect(SCANNER_HEALTH_HREF).toBe("/administration/automation/scheduling/scanner-health");
  });

  it("speaks about one schedule by name when there is only one", () => {
    const notice = buildSystemScheduleAlarmNotice([
      alarm({ title: "Batch deadline supervisor" }),
    ]);
    expect(notice!.title).toBe(
      '"Batch deadline supervisor" is switched off and nothing will run it until a person turns it back on.',
    );
  });

  it("is a warning, not an alarm, when nothing is suspended", () => {
    const notice = buildSystemScheduleAlarmNotice([
      alarm({ alarm: "failing", severity: "warning", enabled: true, title: "Nightly" }),
    ]);
    expect(notice!.tone).toBe("warning");
    expect(notice!.title).toBe('"Nightly" is failing.');
  });
});
