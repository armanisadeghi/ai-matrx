import { captureGapVerdict, formatGap, quietProfile } from "../captureGap";

const HOUR = 60 * 60 * 1_000;
const NOW = Date.parse("2026-08-16T22:30:00Z");

/** Builds a delivery history `hoursAgo` values back from NOW. */
function history(...hoursAgo: number[]): string[] {
  return hoursAgo.map((hours) => new Date(NOW - hours * HOUR).toISOString());
}

/**
 * The real production series that produced the silent outage, reduced to the
 * quiet periods that matter. Arman's longest normal break on record was 31.5h
 * and the outage gap was 23.5h — deliberately INSIDE the envelope, which is
 * why a naive "longer than ever seen" rule would have stayed silent.
 */
const REAL_QUIET_GAPS_HOURS = [31.46, 19.27, 12.02, 9.35, 6.77, 6.44, 5.73, 2.03];

function realisticHistory(): string[] {
  // Walk backwards from the last real delivery, spacing by the observed gaps.
  const stamps: string[] = [];
  let cursor = Date.parse("2026-08-15T23:02:47Z");
  stamps.push(new Date(cursor).toISOString());
  for (const gap of REAL_QUIET_GAPS_HOURS) {
    cursor -= gap * HOUR;
    stamps.push(new Date(cursor).toISOString());
  }
  return stamps;
}

describe("quietProfile", () => {
  it("falls back to conservative defaults when history is too thin", () => {
    const profile = quietProfile(history(1, 2, 3));
    expect(profile.calibrated).toBe(false);
    expect(profile.longestMs).toBe(12 * HOUR);
  });

  it("derives the longest quiet period from real gaps", () => {
    const profile = quietProfile(realisticHistory());
    expect(profile.calibrated).toBe(true);
    expect(profile.longestMs / HOUR).toBeCloseTo(31.46, 1);
  });

  it("never lets a tight cadence push the floor below three hours", () => {
    // Deliveries every ten minutes — p90 is tiny, but the floor holds.
    const tight = Array.from({ length: 20 }, (_, i) => i / 6);
    expect(quietProfile(history(...tight)).typicalMs).toBe(3 * HOUR);
  });

  it("ignores unparseable and null timestamps", () => {
    const profile = quietProfile([...history(1, 2, 3, 4, 5, 6), null, "nope"]);
    expect(profile.calibrated).toBe(true);
  });
});

describe("captureGapVerdict", () => {
  const base = { history: realisticHistory(), readSucceeded: true, nowMs: NOW };

  it("reports a pending read without claiming anything", () => {
    const verdict = captureGapVerdict({
      ...base,
      lastSeenAt: null,
      readSucceeded: null,
    });
    expect(verdict.tone).toBe("unknown");
    expect(verdict.isAlarm).toBe(false);
  });

  it("distinguishes a failed read from an absence of sessions", () => {
    const failed = captureGapVerdict({
      ...base,
      lastSeenAt: null,
      readSucceeded: false,
    });
    expect(failed.tone).toBe("unknown");
    expect(failed.label).toBe("Capture state unavailable");
  });

  it("treats never-connected as setup, not as an outage", () => {
    const verdict = captureGapVerdict({
      lastSeenAt: null,
      history: [],
      readSucceeded: true,
      nowMs: NOW,
    });
    expect(verdict.tone).toBe("never");
    expect(verdict.isAlarm).toBe(false);
    expect(verdict.action).toContain("/mcp");
  });

  it("is healthy when a delivery just landed", () => {
    const verdict = captureGapVerdict({
      ...base,
      lastSeenAt: new Date(NOW - 5 * 60_000).toISOString(),
    });
    expect(verdict.tone).toBe("healthy");
    expect(verdict.isAlarm).toBe(false);
  });

  it("stays silent through a normal short break", () => {
    const verdict = captureGapVerdict({
      ...base,
      lastSeenAt: new Date(NOW - 2 * HOUR).toISOString(),
    });
    expect(verdict.tone).toBe("quiet");
    expect(verdict.isAlarm).toBe(false);
  });

  it("RAISES THE ALARM on the real 23.5-hour outage", () => {
    // The regression this whole module exists for.
    const verdict = captureGapVerdict({
      ...base,
      lastSeenAt: "2026-08-15T23:02:47Z",
    });
    expect(verdict.isAlarm).toBe(true);
    expect(verdict.tone).toBe("suspect");
    expect(verdict.label).toContain("23 hours");
    expect(verdict.action).toContain("/mcp");
    // Honest about what it cannot observe.
    expect(verdict.detail).toContain("could still be a genuine break");
  });

  it("escalates past the owner's longest recorded quiet period", () => {
    const verdict = captureGapVerdict({
      ...base,
      lastSeenAt: new Date(NOW - 35 * HOUR).toISOString(),
    });
    expect(verdict.tone).toBe("stopped");
    expect(verdict.isAlarm).toBe(true);
    expect(verdict.detail).toContain("longer than any quiet period");
  });

  it("escalates past the hard ceiling even when history is wide", () => {
    // A 200-hour vacation gap must not buy permanent silence.
    const wide = [
      ...realisticHistory(),
      new Date(Date.parse("2026-08-15T23:02:47Z") - 300 * HOUR).toISOString(),
    ];
    const verdict = captureGapVerdict({
      history: wide,
      readSucceeded: true,
      nowMs: NOW,
      lastSeenAt: new Date(NOW - 60 * HOUR).toISOString(),
    });
    expect(verdict.tone).toBe("stopped");
  });

  it("never claims calibration it does not have", () => {
    const verdict = captureGapVerdict({
      history: history(20),
      readSucceeded: true,
      nowMs: NOW,
      lastSeenAt: new Date(NOW - 20 * HOUR).toISOString(),
    });
    expect(verdict.calibrated).toBe(false);
    expect(verdict.detail).toContain("not enough delivery history");
  });
});

describe("formatGap", () => {
  it("reads the way a person would say it", () => {
    expect(formatGap(30_000)).toBe("1 minute");
    expect(formatGap(45 * 60_000)).toBe("45 minutes");
    expect(formatGap(1 * HOUR)).toBe("1 hour");
    expect(formatGap(23.5 * HOUR)).toBe("23 hours");
    expect(formatGap(72 * HOUR)).toBe("3 days");
  });
});
