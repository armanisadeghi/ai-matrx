/*
  THE FRESHNESS LINE, held to the two cosmetic lies round 2 recorded (NEW-B7):

    · a `pulledAt` in the FUTURE printed "pulled in 1 day", which reads as a
      promise rather than as the clock problem it is;
    · a `dataThrough` in the future printed with no complaint at all, so a row
      dated past Google's own horizon looked like fresh data;
    · and the stand-in for an unreadable threshold hard-coded "The row is live
      (72 hours since 2026-09-17)" — a sentence that rots the day the knob is
      changed, and lies the day it is.

  Everything else here is the shape Arman asked for: "data through Sep 14,
  pulled 40 min ago, Google runs ~3 days behind".
*/

import {
  describeFreshness,
  FRESHNESS_WARNING_HOURS_KNOB,
  GOOGLE_MARKETING_KNOB_FEATURE,
} from "@/features/marketing/google/freshness";

const NOW = new Date("2026-09-17T18:00:00Z");

describe("describeFreshness — the ordinary cases", () => {
  it("prints day, pull age and Google's own lag", () => {
    const result = describeFreshness({
      provider: "search_console",
      dataThrough: "2026-09-14",
      pulledAt: "2026-09-17T11:00:00Z",
      warningAfterHours: 72,
      now: NOW,
    });
    expect(result.sentence).toContain("data through Sep 14");
    expect(result.sentence).toContain("pulled ");
    expect(result.sentence).toContain("Google runs about three days behind");
    expect(result.stale).toBe(false);
    expect(result.thresholdUnavailable).toBeNull();
  });

  it("goes stale past the knob's threshold", () => {
    expect(
      describeFreshness({
        provider: "analytics",
        dataThrough: "2026-08-10",
        pulledAt: "2026-08-11T00:00:00Z",
        warningAfterHours: 72,
        now: NOW,
      }).stale,
    ).toBe(true);
  });

  it("says plainly when nothing has ever been pulled", () => {
    const result = describeFreshness({
      provider: "analytics",
      dataThrough: null,
      pulledAt: null,
      warningAfterHours: 72,
      now: NOW,
    });
    expect(result.sentence).toContain("no data stored yet");
    expect(result.sentence).toContain("never pulled");
    expect(result.neverPulled).toBe(true);
  });
});

describe("describeFreshness — a clock from the future is named, never printed as an age", () => {
  it("never claims a pull happens in the future", () => {
    const result = describeFreshness({
      provider: "analytics",
      dataThrough: "2026-09-16",
      pulledAt: "2026-09-18T18:00:00Z",
      warningAfterHours: 72,
      now: NOW,
    });
    expect(result.sentence).not.toContain("pulled in ");
    expect(result.sentence).toContain("clock");
    expect(result.clockAhead).toBe(true);
    // An age we cannot trust is not an age: it never reads as fresh OR stale.
    expect(result.stale).toBe(false);
  });

  it("names a data day Google cannot have filed yet", () => {
    const result = describeFreshness({
      provider: "search_console",
      dataThrough: "2026-09-25",
      pulledAt: "2026-09-17T11:00:00Z",
      warningAfterHours: 72,
      now: NOW,
    });
    expect(result.sentence).toContain("Sep 25");
    expect(result.sentence).toContain("has not happened yet");
    expect(result.dataThroughInFuture).toBe(true);
  });

  it("leaves a same-day pull alone", () => {
    expect(
      describeFreshness({
        provider: "analytics",
        dataThrough: "2026-09-17",
        pulledAt: "2026-09-17T17:59:00Z",
        warningAfterHours: 72,
        now: NOW,
      }).clockAhead,
    ).toBe(false);
  });
});

describe("describeFreshness — the unreadable-threshold stand-in", () => {
  const result = describeFreshness({
    provider: "search_console",
    dataThrough: "2026-09-14",
    pulledAt: "2026-09-17T11:00:00Z",
    warningAfterHours: null,
    now: NOW,
  });

  it("is printed, never swallowed, and names the knob", () => {
    expect(result.thresholdUnavailable).toContain(GOOGLE_MARKETING_KNOB_FEATURE);
    expect(result.thresholdUnavailable).toContain(FRESHNESS_WARNING_HOURS_KNOB);
  });

  it("carries no hard-coded value and no hard-coded date", () => {
    expect(result.thresholdUnavailable).not.toContain("72 hours");
    // Today's date, from the clock the caller passed — not a date from the day
    // the sentence was written.
    expect(result.thresholdUnavailable).toContain("2026-09-17");
  });

  it("still refuses to call anything stale while the threshold is unknown", () => {
    expect(result.stale).toBe(false);
  });
});

/*
  ONE CLOCK, NOT TWO (round-4 finding V14-9, 2026-09-17).

  `stale` was judged against the injected `now` while the printed age came from
  `formatRelativeTime`, which read the system clock — so the sentence and the
  verdict were measured against two different instants. In production they are
  the same clock and the user impact is nil; the cost was that the module's own
  tests could not pin the printed age, which is why the PRINTED half of NEW-B7
  went unproven and the verifier's probe read "pulled 10 hours ago" (the
  container's real clock) beside `stale=false` for a 40-minute-old pull.
*/
describe("describeFreshness — the printed age comes from the injected clock", () => {
  it("prints the age Arman asked for, measured against `now`", () => {
    const result = describeFreshness({
      provider: "search_console",
      dataThrough: "2026-09-14",
      // 40 minutes before NOW — the exact shape of §4.8's sentence.
      pulledAt: "2026-09-17T17:20:00Z",
      warningAfterHours: 72,
      now: NOW,
    });
    expect(result.sentence).toBe(
      "data through Sep 14 · pulled 40 minutes ago · Google runs about three days behind",
    );
    expect(result.stale).toBe(false);
  });

  it("prints an age the system clock cannot produce, so the clock is provably the injected one", () => {
    // A pull 5 days before NOW. Against the container's real clock this stamp is
    // in the distant past or the future, never "5 days ago" — the assertion can
    // only pass if `formatRelativeTime` was given `now`.
    const result = describeFreshness({
      provider: "analytics",
      dataThrough: "2026-09-12",
      pulledAt: "2026-09-12T18:00:00Z",
      warningAfterHours: 72,
      now: NOW,
    });
    expect(result.sentence).toContain("pulled 5 days ago");
    expect(result.stale).toBe(true);
    expect(result.pulledHoursAgo).toBeCloseTo(120, 6);
  });

  it("agrees with its own `stale` verdict at the threshold, to the hour", () => {
    // 71 hours: fresh, and the words say 2 days rather than 3.
    const fresh = describeFreshness({
      provider: "search_console",
      dataThrough: "2026-09-14",
      pulledAt: "2026-09-14T19:00:00Z",
      warningAfterHours: 72,
      now: NOW,
    });
    expect(fresh.stale).toBe(false);
    expect(fresh.sentence).toContain("pulled 2 days ago");
    // 73 hours: stale, and the words moved with it.
    const stale = describeFreshness({
      provider: "search_console",
      dataThrough: "2026-09-14",
      pulledAt: "2026-09-14T17:00:00Z",
      warningAfterHours: 72,
      now: NOW,
    });
    expect(stale.stale).toBe(true);
    expect(stale.sentence).toContain("pulled 3 days ago");
  });
});
