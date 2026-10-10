import type { SystemAnnouncement } from "@/types/feedback.types";
import { nameSpendAlarm, sortSpendAlarms, toSpendAlarm } from "./spendAlarm";

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
    expect(alarm?.severity).toBe("error");
    expect(alarm?.ackKey).toBe("a1:3");
    expect(alarm?.link).toBe("https://manage.aimatrx.com/x");
    expect(alarm?.detail).not.toContain("Open:");
  });
  it("sorts errors before warnings", () => {
    const w = toSpendAlarm({ ...base, id: "w", metadata: { alarm: true, severity: "warning" } })!;
    const e = toSpendAlarm({ ...base, id: "e", metadata: { alarm: true, severity: "error" } })!;
    expect(sortSpendAlarms([w, e]).map((a) => a.id)).toEqual(["e", "w"]);
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
  it("shows the person, not the id, and opens that person's usage", () => {
    const named = nameSpendAlarm(toSpendAlarm(row)!, new Map([["u9", "Dana Whitfield"]]));
    expect(named.title).toBe("Spend spike: Dana Whitfield spend, last 24 hours");
    expect(named.detail).not.toContain("u9");
    expect(named.link).toBe("https://manage.aimatrx.com/administration/users/usage?user=u9");
  });
  it("leaves the row alone when no name resolves", () => {
    const alarm = toSpendAlarm(row)!;
    expect(nameSpendAlarm(alarm, new Map())).toBe(alarm);
  });
});
