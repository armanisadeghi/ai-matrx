/**
 * ATTACK-7 finding 6 — the gate's freshness must have a CEILING THAT FAILS.
 *
 * `restore-graph.ts --verify` compares the branch to the boundary the copy recorded, so
 * before this module it passed no matter how old that copy was — and it printed
 * "production's 4603", a snapshot wearing the present tense. Production takes ≈18
 * `iam.permissions` grants an hour (4,603 at 2026-09-16 03:49:55Z, 4,651 2 h 43 m later);
 * over the campaign's 56-hour critical path that is ≈1,000 grants the branch copy will
 * never hold, and `W7-GATE` runs T1 over that copy at H+49.
 *
 * TO SEE THESE GO RED: make `boundaryAgeVerdict` return `{ ok: true }` for every age —
 * the behaviour before this change, where staleness was a log line and not a check. The
 * over-ceiling cases below fail immediately. (Proven that way in a scratch copy before
 * the change landed; the real module is never weakened to demonstrate it.)
 *
 * No database, no credential.
 */
import {
  DEFAULT_MAX_BOUNDARY_AGE_HOURS,
  boundaryAgeVerdict,
  parseMaxBoundaryAgeHours,
} from "../gate-corpus/boundary-age";

const TAKEN = "2026-09-16 03:49:55.480409+00";

describe("the recorded boundary has a maximum age that FAILS (ATTACK-7 finding 6)", () => {
  it("passes under the ceiling, and prints the age", () => {
    const v = boundaryAgeVerdict(2.72, DEFAULT_MAX_BOUNDARY_AGE_HOURS, TAKEN);
    expect(v.ok).toBe(true);
    expect(v.message).toContain("2.72 h");
    expect(v.message).toContain("within the 12.00 h ceiling");
  });

  it("FAILS over the ceiling, and the failure NAMES the age", () => {
    const v = boundaryAgeVerdict(13, DEFAULT_MAX_BOUNDARY_AGE_HOURS, TAKEN);
    expect(v.ok).toBe(false);
    expect(v.message).toContain("BOUNDARY TOO OLD");
    expect(v.message).toContain("13.00 h");
    expect(v.message).toContain("12.00 h ceiling");
  });

  it("FAILS the 59-hour-old copy finding 6 names, and says how far behind it is", () => {
    // The whole-campaign case: W0-DATA's copy read at the end of a 56 h critical path.
    const v = boundaryAgeVerdict(59, DEFAULT_MAX_BOUNDARY_AGE_HOURS, TAKEN);
    expect(v.ok).toBe(false);
    expect(v.message).toContain("59.00 h");
    expect(v.message).toContain("1062 grants"); // 59 × 18/hour
  });

  it("FAILS the H+49 gate case with the default ceiling", () => {
    expect(boundaryAgeVerdict(49, DEFAULT_MAX_BOUNDARY_AGE_HOURS, TAKEN).ok).toBe(false);
  });

  it("names the remedy — re-run the copy and re-verify — in the failure itself", () => {
    const v = boundaryAgeVerdict(59, DEFAULT_MAX_BOUNDARY_AGE_HOURS, TAKEN);
    expect(v.message).toContain("restore-graph.ts");
    expect(v.message).toContain("W0-DATA");
    expect(v.message).toContain("re-verify");
    expect(v.message).toContain("--max-boundary-age=");
  });

  it("names the timestamp it is judging, never a bare 'production's'", () => {
    expect(boundaryAgeVerdict(1, 12, TAKEN).message).toContain(
      `the copy's snapshot of production, taken ${TAKEN}`,
    );
    expect(boundaryAgeVerdict(13, 12, TAKEN).message).toContain(
      `the copy's snapshot of production was taken ${TAKEN}`,
    );
  });

  it("treats an unmeasurable age as too old, not as a pass", () => {
    const v = boundaryAgeVerdict(Number.NaN, 12, "");
    expect(v.ok).toBe(false);
    expect(v.message).toContain("could not be measured");
  });

  it("is exactly at the ceiling, not over it, at the ceiling", () => {
    expect(boundaryAgeVerdict(12, 12, TAKEN).ok).toBe(true);
    expect(boundaryAgeVerdict(12.01, 12, TAKEN).ok).toBe(false);
  });
});

describe("--max-boundary-age is explicit, or it is the default (ATTACK-7 finding 6)", () => {
  it("defaults to 12 hours, and says it was not asked for", () => {
    expect(parseMaxBoundaryAgeHours(["--verify"])).toEqual({ hours: 12, explicit: false });
  });

  it("takes an explicit ceiling", () => {
    expect(parseMaxBoundaryAgeHours(["--verify", "--max-boundary-age=6"])).toEqual({
      hours: 6,
      explicit: true,
    });
  });

  it("a ceiling that would let the 59-hour copy through is allowed, but only by name", () => {
    const { hours, explicit } = parseMaxBoundaryAgeHours(["--max-boundary-age=72"]);
    expect({ hours, explicit }).toEqual({ hours: 72, explicit: true });
    expect(boundaryAgeVerdict(59, hours, TAKEN).ok).toBe(true);
  });

  it("REFUSES a flag with no value rather than silently using the default", () => {
    expect(() => parseMaxBoundaryAgeHours(["--max-boundary-age"])).toThrow(/needs a value in hours/);
  });

  it("REFUSES a value that is not a positive number of hours", () => {
    expect(() => parseMaxBoundaryAgeHours(["--max-boundary-age=soon"])).toThrow(/not a positive number/);
    expect(() => parseMaxBoundaryAgeHours(["--max-boundary-age=0"])).toThrow(/not a positive number/);
    expect(() => parseMaxBoundaryAgeHours(["--max-boundary-age=-4"])).toThrow(/not a positive number/);
  });
});
