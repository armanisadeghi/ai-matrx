// features/scheduling/utils/__tests__/nextFireTime.test.ts

import {
  computeNextFireTime,
  nextNCronFires,
  validateCron,
} from "../nextFireTime";

describe("computeNextFireTime", () => {
  const NOW = new Date("2026-05-10T12:00:00Z");

  test("one-shot returns the at timestamp", () => {
    const out = computeNextFireTime(
      { type: "one-shot", at: "2026-05-12T15:00:00Z" },
      NOW,
    );
    expect(out.eventDriven).toBe(false);
    expect(out.nextDueAt).toBe("2026-05-12T15:00:00.000Z");
  });

  test("interval advances by every_seconds from now", () => {
    const out = computeNextFireTime(
      { type: "interval", every_seconds: 3600 },
      NOW,
    );
    expect(out.nextDueAt).toBe("2026-05-10T13:00:00.000Z");
  });

  test("heartbeat works identically to interval", () => {
    const out = computeNextFireTime(
      { type: "heartbeat", every_seconds: 60 },
      NOW,
    );
    expect(out.nextDueAt).toBe("2026-05-10T12:01:00.000Z");
  });

  test("interval with zero throws", () => {
    expect(() =>
      computeNextFireTime({ type: "interval", every_seconds: 0 }, NOW),
    ).toThrow();
  });

  test("cron computes next fire respecting timezone", () => {
    const out = computeNextFireTime(
      {
        type: "cron",
        expression: "0 9 * * 1-5",
        tz: "America/Los_Angeles",
      },
      NOW,
    );
    // 2026-05-10 12:00 UTC is Sunday 05:00 LA. Next weekday 9am LA =
    // Mon 2026-05-11 09:00 LA = 16:00 UTC.
    expect(out.nextDueAt).toBe("2026-05-11T16:00:00.000Z");
    expect(out.eventDriven).toBe(false);
  });

  test("context-match returns null next + eventDriven=true", () => {
    const out = computeNextFireTime(
      { type: "context-match", hostname: "github.com" },
      NOW,
    );
    expect(out.nextDueAt).toBeNull();
    expect(out.eventDriven).toBe(true);
  });
});

describe("validateCron", () => {
  test("happy paths return null", () => {
    expect(validateCron("0 9 * * 1-5", "America/Los_Angeles")).toBeNull();
    expect(validateCron("*/15 * * * *", "UTC")).toBeNull();
  });

  test("invalid expression returns a message", () => {
    expect(validateCron("not a cron", "UTC")).toBeTruthy();
  });

  test("empty string returns a message", () => {
    expect(validateCron("", "UTC")).toBeTruthy();
  });
});

describe("nextNCronFires", () => {
  test("returns exactly N strictly-increasing fires", () => {
    const fires = nextNCronFires(
      "0 9 * * 1-5",
      "UTC",
      5,
      new Date("2026-05-10T00:00:00Z"),
    );
    expect(fires).toHaveLength(5);
    for (let i = 1; i < fires.length; i++) {
      expect(new Date(fires[i]).getTime()).toBeGreaterThan(
        new Date(fires[i - 1]).getTime(),
      );
    }
  });
});
