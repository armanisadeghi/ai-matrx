/**
 * Rows of `scheduler.system_schedule_alarms` → items a person can act on.
 * Fixtures are shaped exactly like the RPC's v2 output (the three commerce
 * rows and one SEO row as they stood live on 2026-09-14).
 */

import type { SystemScheduleAlarm } from "@/features/scheduling/service/queries";
import { scheduleAlarmItems, summarizeScheduleAlarms } from "../sources/schedule-alarms";

const NOW = Date.parse("2026-09-14T20:00:00Z");

function row(over: Partial<SystemScheduleAlarm>): SystemScheduleAlarm {
  return {
    task_id: "a7c1e2d3-0000-4e5f-9a00-000000000544",
    title: "Commerce eBay sync engine",
    description: "Knob-gated tick (every 5 min): drains the eBay push queues.",
    tags: ["system", "commerce"],
    kind: "tool",
    alarm: "suspended",
    severity: "critical",
    detail:
      "The repeat guard switched this off, but a later run succeeded — it is off for no live reason. Re-enabling is safe.",
    enabled: false,
    next_due_at: null,
    last_run_at: "2026-08-30T00:37:34Z",
    suspended_at: "2026-08-29T18:11:03Z",
    consecutive_failures: 3,
    succeeded_since_suspension: true,
    last_run_id: "8adb341a-7e60-4740-853d-e61af88e826e",
    last_run_status: "success",
    last_run_error: null,
    last_run_finished_at: "2026-08-30T00:37:34Z",
    failed_streak: 0,
    approval: null,
    impact: [
      { href: "/commerce/stores/connect", label: "Connected stores", what: "Nothing pushes to eBay." },
    ],
    muted_until: null,
    mute_reason: null,
    mute_by: null,
    mute_at: null,
    ...over,
  };
}

function deps() {
  return {
    reenable: jest.fn(async (_row: SystemScheduleAlarm) => {}),
    mute: jest.fn(async (_taskId: string, _untilIso: string, _note: string | null) => {}),
    unmute: jest.fn(async (_taskId: string) => {}),
    now: NOW,
  };
}

describe("scheduleAlarmItems", () => {
  it("a suspended row is a critical item with the record door, the impact door, Re-enable and a server mute", () => {
    const d = deps();
    const [item] = scheduleAlarmItems([row({})], d);
    expect(item.severity).toBe("critical");
    expect(item.record).toEqual({
      token: "sch_task",
      id: "a7c1e2d3-0000-4e5f-9a00-000000000544",
      href: "/schedules/a7c1e2d3-0000-4e5f-9a00-000000000544",
    });
    expect(item.state).toMatch(/^switched off .* ago$/);
    expect(item.doors).toEqual([
      { kind: "impact", href: "/commerce/stores/connect", label: "Connected stores", what: "Nothing pushes to eBay." },
    ]);
    expect(item.impactDeclared).toBe(true);
    expect(item.actions.map((a) => a.id)).toEqual(["reenable"]);
    expect(item.actions[0].confirm?.description).toContain("A run has already succeeded since the guard switched it off");
    expect(item.mute.scope).toBe("server");
    expect(item.mute.current).toBeNull();
  });

  it("a failing row opens the run that failed, and says so when no impact was declared", () => {
    const [item] = scheduleAlarmItems(
      [
        row({
          alarm: "failing",
          severity: "warning",
          enabled: true,
          failed_streak: 2,
          last_run_status: "failed",
          last_run_error: "lease expired",
          impact: null,
          detail: "2 runs in a row have failed. Last error: lease expired",
        }),
      ],
      deps(),
    );
    expect(item.severity).toBe("warning");
    expect(item.state).toBe("2 runs failed in a row");
    expect(item.doors).toEqual([
      {
        kind: "evidence",
        href: "/schedules/a7c1e2d3-0000-4e5f-9a00-000000000544#run-8adb341a-7e60-4740-853d-e61af88e826e",
        label: "The run that failed",
        what: "lease expired",
      },
    ]);
    expect(item.impactDeclared).toBe(false);
    expect(item.actions).toEqual([]);
  });

  it("the mute writes an ISO `until` and the note; unmute clears it", async () => {
    const d = deps();
    const [item] = scheduleAlarmItems([row({})], d);
    await item.mute.apply(NOW + 8 * 24 * 3_600_000, "commerce is not built yet");
    expect(d.mute).toHaveBeenCalledWith(
      "a7c1e2d3-0000-4e5f-9a00-000000000544",
      "2026-09-22T20:00:00.000Z",
      "commerce is not built yet",
    );
    await item.mute.clear!();
    expect(d.unmute).toHaveBeenCalledWith("a7c1e2d3-0000-4e5f-9a00-000000000544");
  });

  it("a live mute on the row is carried; an expired one is not", () => {
    const [live] = scheduleAlarmItems(
      [row({ muted_until: "2026-09-22T00:00:00Z", mute_reason: "unbuilt", mute_by: "admin@admin.com" })],
      deps(),
    );
    expect(live.mute.current).toEqual({ until: "2026-09-22T00:00:00Z", reason: "unbuilt", by: "admin@admin.com" });
    const [expired] = scheduleAlarmItems([row({ muted_until: "2026-09-01T00:00:00Z" })], deps());
    expect(expired.mute.current).toBeNull();
  });

  it("Re-enable runs the injected write for that row", async () => {
    const d = deps();
    const [item] = scheduleAlarmItems([row({})], d);
    await item.actions[0].run();
    expect(d.reenable).toHaveBeenCalledTimes(1);
    expect(d.reenable.mock.calls[0]?.[0]?.task_id).toBe("a7c1e2d3-0000-4e5f-9a00-000000000544");
  });

  it("summarises in a person's words", () => {
    const items = scheduleAlarmItems(
      [
        row({ task_id: "1" }),
        row({ task_id: "2", title: "Commerce disposal audit" }),
        row({ task_id: "3", alarm: "failing", severity: "warning", enabled: true, failed_streak: 2 }),
      ],
      deps(),
    );
    expect(summarizeScheduleAlarms(items)).toBe(
      "2 scheduled jobs are switched off and nothing will run them until a person turns them back on; 1 more is failing or overdue.",
    );
    expect(summarizeScheduleAlarms([])).toBeNull();
  });
});
