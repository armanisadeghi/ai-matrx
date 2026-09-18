/**
 * Guards for the two ways out. They fail against the version Arman rejected
 * (2026-09-12), which had NO way out — and they fail again the moment someone
 * makes a mute or a snooze permanent, which is the real risk with an
 * operational alarm.
 */

import {
  clearSnooze,
  DEFAULT_SNOOZE,
  readSnoozedUntil,
  SNOOZE_CHOICES,
  writeSnooze,
} from "../dock-snooze";
import { clearMutes, MUTE_CHOICES, muteItem, NOTE_MUTE, readMuteMap, unmuteItem } from "../item-mute";

const NOW = 1_700_000_000_000;

describe("dock snooze", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows by default — nothing stored means nothing silenced", () => {
    expect(readSnoozedUntil()).toBeNull();
  });

  it("silences for the chosen span and reports when it wakes", () => {
    const until = writeSnooze(SNOOZE_CHOICES[0].ms, NOW);
    expect(until).toBe(NOW + 3_600_000);
    expect(readSnoozedUntil(NOW + 1_000)).toBe(until);
  });

  it("ALWAYS comes back: an elapsed snooze reads as not snoozed and is cleared", () => {
    writeSnooze(DEFAULT_SNOOZE.ms, NOW);
    expect(readSnoozedUntil(NOW + DEFAULT_SNOOZE.ms + 1)).toBeNull();
    expect(window.localStorage.getItem("matrx.admin-attention.snoozed-until")).toBeNull();
  });

  it("refuses a garbage stored value rather than staying silent", () => {
    window.localStorage.setItem("matrx.admin-attention.snoozed-until", "forever");
    expect(readSnoozedUntil()).toBeNull();
  });

  it("clears on demand, and no choice is permanent", () => {
    writeSnooze(DEFAULT_SNOOZE.ms);
    clearSnooze();
    expect(readSnoozedUntil()).toBeNull();
    for (const c of SNOOZE_CHOICES) expect(c.ms).toBeLessThanOrEqual(3 * 24 * 3_600_000);
  });
});

describe("local item mutes", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearMutes();
  });

  it("mutes one key for the chosen span and leaves the others loud", () => {
    const until = muteItem("outages:a", MUTE_CHOICES[0].ms, NOW);
    expect(until).toBe(NOW + 3_600_000);
    const map = readMuteMap(NOW + 1);
    expect(map["outages:a"]).toBe(until);
    expect(map["outages:b"]).toBeUndefined();
  });

  it("an expired mute is pruned as it is read — never honoured", () => {
    muteItem("outages:a", MUTE_CHOICES[0].ms, NOW);
    expect(readMuteMap(NOW + MUTE_CHOICES[0].ms + 1)).toEqual({});
    expect(JSON.parse(window.localStorage.getItem("matrx.admin-attention.muted") ?? "{}")).toEqual({});
  });

  it("unmute lifts one key early", () => {
    muteItem("outages:a", MUTE_CHOICES[1].ms, NOW);
    muteItem("outages:b", MUTE_CHOICES[1].ms, NOW);
    unmuteItem("outages:a", NOW);
    expect(Object.keys(readMuteMap(NOW))).toEqual(["outages:b"]);
  });

  it("garbage in storage reads as nothing muted", () => {
    window.localStorage.setItem("matrx.admin-attention.muted", "[1,2");
    expect(readMuteMap(NOW)).toEqual({});
  });

  it("the longest choice is a month — silence beyond that is a decision about the schedule, not the alarm", () => {
    expect(Math.max(...MUTE_CHOICES.map((c) => c.ms))).toBe(30 * 24 * 3_600_000);
    expect(NOTE_MUTE.id).toBe("30d");
  });
});
