import {
  DEFAULT_RECURRENCE,
  describeRecurrence,
  formatTimeOfDay,
  fromCron,
  toCron,
  type Recurrence,
} from "../recurrence";

describe("toCron", () => {
  it("builds the five plain-language shapes", () => {
    expect(toCron({ mode: "daily", hour: 9, minute: 0 })).toBe("0 9 * * *");
    expect(toCron({ mode: "weekdays", hour: 17, minute: 30 })).toBe(
      "30 17 * * 1-5",
    );
    expect(toCron({ mode: "weekly", days: [5, 1], hour: 8, minute: 15 })).toBe(
      "15 8 * * 1,5",
    );
    expect(toCron({ mode: "monthly", dayOfMonth: 3, hour: 6, minute: 0 })).toBe(
      "0 6 3 * *",
    );
    expect(toCron({ mode: "hourly", everyHours: 6, minute: 0 })).toBe(
      "0 */6 * * *",
    );
    expect(toCron({ mode: "hourly", everyHours: 1, minute: 45 })).toBe(
      "45 * * * *",
    );
  });

  it("passes an advanced expression through verbatim", () => {
    expect(toCron({ mode: "advanced", expression: " 0 2 */3 * 4 " })).toBe(
      "0 2 */3 * 4",
    );
  });

  it("refuses a day-of-month a short month could skip", () => {
    expect(toCron({ mode: "monthly", dayOfMonth: 31, hour: 0, minute: 0 })).toBe(
      "0 0 28 * *",
    );
  });

  it("never emits an empty weekly day set", () => {
    expect(toCron({ mode: "weekly", days: [], hour: 9, minute: 0 })).toBe(
      "0 9 * * 1",
    );
  });
});

describe("fromCron", () => {
  const round = (r: Recurrence) => fromCron(toCron(r));

  it("round-trips every authored shape", () => {
    const shapes: Recurrence[] = [
      { mode: "daily", hour: 9, minute: 0 },
      { mode: "weekdays", hour: 17, minute: 30 },
      { mode: "weekly", days: [1, 5], hour: 8, minute: 15 },
      { mode: "monthly", dayOfMonth: 3, hour: 6, minute: 0 },
      { mode: "hourly", everyHours: 6, minute: 0 },
      { mode: "hourly", everyHours: 1, minute: 45 },
    ];
    for (const shape of shapes) {
      expect(round(shape)).toEqual(shape);
    }
  });

  it("keeps an unrecognized expression as the person typed it", () => {
    const weird = "0 2 */3 6 4";
    expect(fromCron(weird)).toEqual({ mode: "advanced", expression: weird });
  });

  it("does not invent a shape from a malformed expression", () => {
    for (const bad of ["", "0 9 * *", "abc", "99 9 * * *", "0 9 * * 9"]) {
      expect(fromCron(bad).mode).toBe("advanced");
    }
  });

  it("reads 1-5 back as weekdays, not as a weekly list", () => {
    expect(fromCron("0 9 * * 1-5")).toEqual({
      mode: "weekdays",
      hour: 9,
      minute: 0,
    });
  });
});

describe("describeRecurrence", () => {
  it("never leaks cron syntax for an authored shape", () => {
    expect(describeRecurrence({ mode: "daily", hour: 9, minute: 0 })).toBe(
      "Every day at 9:00 AM",
    );
    expect(describeRecurrence({ mode: "weekdays", hour: 17, minute: 30 })).toBe(
      "Every weekday at 5:30 PM",
    );
    expect(
      describeRecurrence({ mode: "weekly", days: [1], hour: 8, minute: 0 }),
    ).toBe("Every Monday at 8:00 AM");
    expect(
      describeRecurrence({ mode: "weekly", days: [1, 3, 5], hour: 8, minute: 0 }),
    ).toBe("Every Mon, Wed and Fri at 8:00 AM");
    expect(
      describeRecurrence({ mode: "monthly", dayOfMonth: 1, hour: 0, minute: 0 }),
    ).toBe("On day 1 of every month at 12:00 AM");
  });
});

describe("formatTimeOfDay", () => {
  it("uses 12 for both noon and midnight", () => {
    expect(formatTimeOfDay(0, 0)).toBe("12:00 AM");
    expect(formatTimeOfDay(12, 5)).toBe("12:05 PM");
  });
});

describe("DEFAULT_RECURRENCE", () => {
  it("is a valid, describable, round-tripping shape", () => {
    expect(fromCron(toCron(DEFAULT_RECURRENCE))).toEqual(DEFAULT_RECURRENCE);
  });
});
