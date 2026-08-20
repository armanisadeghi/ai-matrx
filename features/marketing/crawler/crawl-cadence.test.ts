/**
 * The crawl frequency floor, client side.
 *
 * This file is the THIRD layer of one rule. The `web_crawl_schedule_cadence_floor`
 * database trigger is what actually refuses the row (this write is
 * client-direct, so a check living only here would bind the UI and nothing
 * else), and `schedules.py` is what refuses to FIRE one that got stored. This
 * layer's job is to say WHY, in words, before the save — so the cases below are
 * the ones no eyeball check separates: a legal expression that leads with a step
 * prefix, an illegal one that has none, and the one-minute gap that exists only
 * across midnight.
 *
 * The expectations are byte-identical to `FLOOR_CASES` in
 * `aidream/packages/matrx-scraper/tests/test_crawl_schedules.py`. A number that
 * differs between the two files is a drift bug, not a rounding preference.
 */
import {
  MIN_CRAWL_INTERVAL_MINUTES,
  assertCrawlCadenceAllowed,
  crawlCadenceMinGapMinutes,
  crawlCadenceRefusal,
} from "@/features/marketing/crawler/crawl-cadence";

const FLOOR_CASES: ReadonlyArray<readonly [string, number]> = [
  ["*/10 * * * *", 10],
  ["*/5 * * * *", 5],
  ["* * * * *", 1],
  ["0,5 * * * *", 5],
  ["0,20,40 * * * *", 20],
  ["0,59 0,23 * * *", 1],
  ["15,45 8-17 * * 1-5", 30],
  ["*/15 * * * *", 15],
  ["0 * * * *", 60],
  ["0 */6 * * *", 360],
  ["0 3 * * *", 1440],
  ["0 3 * * 1", 10080],
  ["0 3 1 * *", 40320],
  ["0 3 1,15 * *", 20160],
  ["0 3 */2 * *", 1440],
  ["0 3 29-31 * *", 1440],
  ["30 2 * * 1,3", 2880],
];

describe("crawl cadence frequency floor", () => {
  it.each(FLOOR_CASES)(
    "computes the shortest gap %s can ever produce",
    (expression, gap) => {
      expect(crawlCadenceMinGapMinutes({ kind: "cron", expression })).toBe(gap);
    },
  );

  it.each(FLOOR_CASES.filter(([, gap]) => gap < MIN_CRAWL_INTERVAL_MINUTES))(
    "refuses %s and names the frequency",
    (expression) => {
      const refusal = crawlCadenceRefusal({ kind: "cron", expression });
      expect(refusal).toBeTruthy();
      // A user told "too often" without being told "how often" cannot tell what
      // to change.
      expect(refusal).toMatch(/every/);
      expect(() => assertCrawlCadenceAllowed({ kind: "cron", expression })).toThrow();
    },
  );

  it.each(FLOOR_CASES.filter(([, gap]) => gap >= MIN_CRAWL_INTERVAL_MINUTES))(
    "allows %s",
    (expression) => {
      expect(crawlCadenceRefusal({ kind: "cron", expression })).toBeNull();
    },
  );

  it("refuses rather than clamping", () => {
    // Quietly rounding 10 minutes up to 15 would leave the user believing they
    // configured something they did not.
    expect(crawlCadenceRefusal({ kind: "cron", expression: "*/10 * * * *" })).toContain(
      "not allowed",
    );
  });

  it.each([
    "0 3 * * MON",
    "0 0 3 * * *",
    "0 3 * *",
    "0 3 L * *",
    "0 3 * * 1#2",
    "*/0 * * * *",
    "70 * * * *",
  ])("fails closed on %s, which it cannot expand", (expression) => {
    expect(crawlCadenceRefusal({ kind: "cron", expression })).toBeTruthy();
  });

  it("floors the interval cadence too", () => {
    expect(crawlCadenceRefusal({ kind: "interval", minutes: 5 })).toBeTruthy();
    expect(crawlCadenceRefusal({ kind: "interval", minutes: 360 })).toBeNull();
  });

  it("mirrors every cadence the UI itself can emit", () => {
    // The presets must never be able to produce something the database refuses.
    for (const cadence of [
      { kind: "interval", minutes: 6 * 60 },
      { kind: "interval", minutes: 12 * 60 },
      { kind: "cron", expression: "0 3 * * *" },
      { kind: "cron", expression: "0 3 * * 1" },
      { kind: "cron", expression: "0 3 1 * *" },
    ] as const) {
      expect(crawlCadenceRefusal(cadence)).toBeNull();
    }
  });
});
