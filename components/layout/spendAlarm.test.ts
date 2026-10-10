import type { SystemAnnouncement } from "@/types/feedback.types";
import { countByLevel, isAgentSeat, readClosedAlarms, writeClosedAlarms, nameSpendAlarm, sortSpendAlarms, toSpendAlarm } from "./spendAlarm";

const base = {
  id: "a1",
  title: "Spend spike",
  message: "Platform spend $40.\n\nHappened 3 times.\n\nOpen: https://manage.aimatrx.com/x",
  announcement_type: "critical",
  is_active: true,
  created_at: "2026-10-09T10:00:00Z",
  updated_at: "2026-10-09T11:00:00Z",
  created_by: null,
  target_user_id: "u1",
  min_display_seconds: 10,
} as SystemAnnouncement;

describe("toSpendAlarm", () => {
  it("ignores an ordinary announcement", () => {
    expect(toSpendAlarm({ ...base, metadata: {} })).toBeNull();
  });
  it("reads an alarm row and keys acknowledgement on its count", () => {
    const alarm = toSpendAlarm({
      ...base,
      metadata: { alarm: true, severity: "error", count: 3, link: "https://manage.aimatrx.com/x" },
    });
    expect(alarm?.level).toBe("critical");
    expect(alarm?.ackKey).toBe("a1:3");
    // No record id: nothing to open (the writer always sends one; a row without is migrated).
    expect(alarm?.link).toBeNull();
    expect(alarm?.detail).not.toContain("Open:");
  });
  it("sorts critical first, then warning, then info", () => {
    const mk = (id: string, level: string) => toSpendAlarm({ ...base, id, metadata: { alarm: true, level } })!;
    const out = sortSpendAlarms([mk("i", "info"), mk("w", "warning"), mk("c", "critical")]);
    expect(out.map((a) => a.id)).toEqual(["c", "w", "i"]);
  });
  it("reads the writer's level and fix line", () => {
    const alarm = toSpendAlarm({
      ...base,
      metadata: { alarm: true, level: "info", fix: "None needed", link_kind: "user" },
    })!;
    expect(alarm.level).toBe("info");
    expect(alarm.fix).toBe("None needed");
  });
  it("re-grades an old row that only has the two-step severity", () => {
    expect(toSpendAlarm({ ...base, metadata: { alarm: true, severity: "error" } })!.level).toBe("critical");
    expect(toSpendAlarm({ ...base, metadata: { alarm: true, severity: "warning" } })!.level).toBe("warning");
    expect(toSpendAlarm({ ...base, metadata: { alarm: true } })!.fix).toBeNull();
  });
  it("counts alarms per level", () => {
    const mk = (id: string, level: string) => toSpendAlarm({ ...base, id, metadata: { alarm: true, level } })!;
    expect(countByLevel([mk("a", "critical"), mk("b", "critical"), mk("c", "info")])).toEqual({
      critical: 2,
      warning: 0,
      info: 1,
    });
  });
});

describe("nameSpendAlarm", () => {
  const row = {
    ...base,
    title: "Spend spike: Account u9 spend, last 24 hours $10.67",
    message: "Account u9 spend, last 24 hours: $10.67 against a baseline of $1.85.",
    metadata: {
      alarm: true,
      severity: "error",
      subject_type: "account",
      subject_id: "u9",
      link: "https://manage.aimatrx.com/administration/billing",
    },
  } as SystemAnnouncement;
  it("shows the person, not the id, and still opens the alarm's own record", () => {
    const named = nameSpendAlarm(toSpendAlarm({ ...row, metadata: { ...(row.metadata as object), record_id: "rec-9" } })!, new Map([["u9", "Dana Whitfield"]]));
    expect(named.title).toBe("Spend spike: Dana Whitfield spend, last 24 hours");
    expect(named.detail).not.toContain("u9");
    expect(named.link).toBe("/administration/billing/alarms/rec-9");
  });
  it("opens the record page whatever link an old row carries", () => {
    const alarm = toSpendAlarm({
      ...base,
      metadata: { alarm: true, record_id: "rec-1", kind: "protected_account_refusal", link: "https://manage.aimatrx.com/administration/users/usage?user=u1" },
    })!;
    expect(alarm.recordId).toBe("rec-1");
    expect(alarm.link).toBe("/administration/billing/alarms/rec-1");
    expect(alarm.kind).toBe("protected_account_refusal");
  });
  it("leaves the row alone when no name resolves", () => {
    const alarm = toSpendAlarm(row)!;
    expect(nameSpendAlarm(alarm, new Map())).toBe(alarm);
  });
});

describe("agent seats and session close", () => {
  it("agent and test seats are not people", () => {
    expect(isAgentSeat({ email: "admin@admin.com", appMetadata: {} })).toBe(true);
    expect(isAgentSeat({ email: "Test@Test.com", appMetadata: null })).toBe(true);
    expect(isAgentSeat({ email: "x@y.com", appMetadata: { test_fixture: { expires: "z" } } })).toBe(true);
    expect(isAgentSeat({ email: "arman@armansadeghi.com", appMetadata: {} })).toBe(false);
  });
  it("a close is remembered per person for the session, and a bumped alarm is a new key", () => {
    window.sessionStorage.clear();
    writeClosedAlarms("u1", ["a1:1"]);
    expect(readClosedAlarms("u1")).toEqual(["a1:1"]);
    expect(readClosedAlarms("u1")).not.toContain("a1:2");
    expect(readClosedAlarms("u2")).toEqual([]);
  });
});
