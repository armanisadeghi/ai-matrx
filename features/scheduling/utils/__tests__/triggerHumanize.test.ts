// features/scheduling/utils/__tests__/triggerHumanize.test.ts

import { humanizeRelative, humanizeTrigger } from "../triggerHumanize";

describe("humanizeTrigger", () => {
  test("one-shot with valid ISO", () => {
    const out = humanizeTrigger("one-shot", { at: "2026-05-12T15:00:00Z" });
    expect(out).toMatch(/^Once at /);
  });

  test("one-shot without at returns generic label", () => {
    expect(humanizeTrigger("one-shot", {})).toBe("Once");
  });

  test("interval renders unit-aware label", () => {
    expect(humanizeTrigger("interval", { every_seconds: 3600 })).toBe(
      "Every 1 hour",
    );
    expect(humanizeTrigger("interval", { every_seconds: 7200 })).toBe(
      "Every 2 hours",
    );
    expect(humanizeTrigger("interval", { every_seconds: 60 })).toBe(
      "Every 1 minute",
    );
    expect(humanizeTrigger("interval", { every_seconds: 30 })).toBe(
      "Every 30 seconds",
    );
  });

  test("heartbeat prefixes with 'Heartbeat'", () => {
    expect(humanizeTrigger("heartbeat", { every_seconds: 60 })).toBe(
      "Heartbeat every 1 minute",
    );
  });

  test("cron humanizes via cronstrue", () => {
    const out = humanizeTrigger("cron", {
      expression: "0 9 * * 1-5",
      tz: "America/Los_Angeles",
    });
    // cronstrue output is "At 09:00 AM, Monday through Friday" (approximate)
    expect(out.toLowerCase()).toContain("09:00");
    expect(out).toContain("Los Angeles");
  });

  test("cron with malformed expression falls back to raw expression", () => {
    const out = humanizeTrigger("cron", { expression: "garbage", tz: "UTC" });
    expect(out).toContain("garbage");
  });

  test("context-match combines fields", () => {
    expect(
      humanizeTrigger("context-match", {
        kind: "pull_request",
        hostname: "github.com",
      }),
    ).toBe("When pull_request on github.com");
  });

  test("context-match without any fields falls back to label", () => {
    expect(humanizeTrigger("context-match", {})).toBe("On page match");
  });
});

describe("humanizeRelative", () => {
  test("null returns dash", () => {
    expect(humanizeRelative(null)).toBe("—");
  });

  test("future date renders 'in ...'", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(humanizeRelative(future)).toMatch(/in /);
  });

  test("past date renders '... ago'", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(humanizeRelative(past)).toMatch(/ago/);
  });

  test("malformed input returns dash", () => {
    expect(humanizeRelative("not a date")).toBe("—");
  });
});
