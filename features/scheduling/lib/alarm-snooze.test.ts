/**
 * Guards for the snooze doors on the global schedule alarm. These fail against
 * the version Arman rejected (2026-09-12), which had NO way out at all — and
 * they fail again the moment someone makes a snooze permanent, which is the
 * real risk with an operational alarm.
 */

import {
  clearSnooze,
  DEFAULT_SNOOZE,
  readSnoozedUntil,
  SNOOZE_CHOICES,
  writeSnooze,
} from "./alarm-snooze";

describe("alarm snooze", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows by default — nothing stored means nothing silenced", () => {
    expect(readSnoozedUntil()).toBeNull();
  });

  it("silences for the chosen span and reports when it wakes", () => {
    const now = 1_700_000_000_000;
    const until = writeSnooze(SNOOZE_CHOICES[0].ms, now);
    expect(until).toBe(now + 3_600_000);
    expect(readSnoozedUntil(now + 1_000)).toBe(until);
  });

  it("ALWAYS comes back: an elapsed snooze reads as not snoozed and is cleared", () => {
    const now = 1_700_000_000_000;
    writeSnooze(DEFAULT_SNOOZE.ms, now);
    expect(readSnoozedUntil(now + DEFAULT_SNOOZE.ms + 1)).toBeNull();
    // …and the stale key is gone, so nothing can resurrect the silence.
    expect(window.localStorage.getItem("matrx.schedule-alarm-banner.snoozed-until")).toBeNull();
  });

  it("refuses a garbage or non-finite stored value rather than staying silent", () => {
    window.localStorage.setItem("matrx.schedule-alarm-banner.snoozed-until", "forever");
    expect(readSnoozedUntil()).toBeNull();
  });

  it("clears on demand", () => {
    writeSnooze(DEFAULT_SNOOZE.ms);
    clearSnooze();
    expect(readSnoozedUntil()).toBeNull();
  });

  it("offers only bounded choices — no 'never show again'", () => {
    expect(SNOOZE_CHOICES.length).toBeGreaterThan(1);
    for (const choice of SNOOZE_CHOICES) {
      expect(choice.ms).toBeGreaterThan(0);
      expect(choice.ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    }
  });
});
