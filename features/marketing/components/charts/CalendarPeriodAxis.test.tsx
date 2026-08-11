import { buildCalendarPeriodMarks } from "./CalendarPeriodAxis";

describe("buildCalendarPeriodMarks", () => {
  it("labels every visible year and emphasizes calendar quarters", () => {
    const marks = buildCalendarPeriodMarks([
      "2024-11-30",
      "2024-12-31",
      "2025-01-31",
      "2025-02-28",
      "2025-04-30",
      "2026-01-31",
    ]);

    expect(marks.get("2024-11-30")).toEqual({
      period: "2024-11-30",
      weight: "year",
      yearLabel: "2024",
    });
    expect(marks.get("2024-12-31")?.weight).toBe("month");
    expect(marks.get("2025-01-31")).toEqual({
      period: "2025-01-31",
      weight: "year",
      yearLabel: "2025",
    });
    expect(marks.get("2025-02-28")?.weight).toBe("month");
    expect(marks.get("2025-04-30")?.weight).toBe("quarter");
    expect(marks.get("2026-01-31")?.yearLabel).toBe("2026");
  });

  it("ignores malformed periods instead of inventing calendar context", () => {
    const marks = buildCalendarPeriodMarks([
      "not-a-date",
      "2026-13-31",
      "2026-08-31",
    ]);

    expect(marks.has("not-a-date")).toBe(false);
    expect(marks.has("2026-13-31")).toBe(false);
    expect(marks.get("2026-08-31")?.yearLabel).toBe("2026");
  });
});
