import {
  DEFAULT_QUIET_KEY,
  formatQuietRemaining,
  isQuiet,
  QUIET_FOREVER,
  QUIET_WINDOWS,
  quietUntil,
} from "./quiet";

const NOW = new Date("2026-08-19T14:30:00.000Z");

describe("quietUntil", () => {
  it("adds the window's duration", () => {
    expect(quietUntil("1h", NOW)).toBe("2026-08-19T15:30:00.000Z");
    expect(quietUntil("4h", NOW)).toBe("2026-08-19T18:30:00.000Z");
  });

  it("resolves 'forever' to the Postgres value both scopes speak", () => {
    expect(quietUntil("forever", NOW)).toBe(QUIET_FOREVER);
  });

  it("ends 'rest of today' at the LOCAL end of day, not UTC", () => {
    // The user's day is the one they are living in; an end-of-day computed in
    // UTC would end a mute at 5pm for anyone west of Greenwich.
    const end = new Date(quietUntil("today", NOW));
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it("falls back to the default window rather than throwing on a bad key", () => {
    expect(quietUntil("nonsense", NOW)).toBe(quietUntil(DEFAULT_QUIET_KEY, NOW));
  });

  it("keeps every declared window resolvable", () => {
    for (const window of QUIET_WINDOWS) {
      expect(isQuiet(quietUntil(window.key, NOW), NOW)).toBe(true);
    }
  });
});

describe("isQuiet", () => {
  it("is false for null, empty and unparseable values", () => {
    expect(isQuiet(null, NOW)).toBe(false);
    expect(isQuiet(undefined, NOW)).toBe(false);
    expect(isQuiet("", NOW)).toBe(false);
    expect(isQuiet("not a date", NOW)).toBe(false);
  });

  it("is false once the deadline passes — the window ends itself", () => {
    expect(isQuiet("2026-08-19T14:29:59.000Z", NOW)).toBe(false);
    expect(isQuiet("2026-08-19T14:30:01.000Z", NOW)).toBe(true);
  });

  it("treats infinity as quiet forever", () => {
    expect(isQuiet(QUIET_FOREVER, NOW)).toBe(true);
  });
});

describe("formatQuietRemaining", () => {
  it("returns null when nothing is quiet — never a stale label", () => {
    expect(formatQuietRemaining(null, NOW)).toBeNull();
    expect(formatQuietRemaining("2026-08-19T14:00:00.000Z", NOW)).toBeNull();
  });

  it("says what the permanent mute actually means", () => {
    expect(formatQuietRemaining(QUIET_FOREVER, NOW)).toBe(
      "until you turn it back on",
    );
  });

  it("degrades from minutes to hours to days", () => {
    expect(formatQuietRemaining("2026-08-19T14:45:00.000Z", NOW)).toBe("15m left");
    expect(formatQuietRemaining("2026-08-19T18:30:00.000Z", NOW)).toBe("4h left");
    expect(formatQuietRemaining("2026-08-26T14:30:00.000Z", NOW)).toBe("7d left");
  });
});
