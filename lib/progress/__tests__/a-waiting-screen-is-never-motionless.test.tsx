/**
 * A WAITING SCREEN IS NEVER MOTIONLESS.
 *
 * 🚨 THE DEFECT (cold walk 6, finding 6, 2026-09-17). Two Masterwork lanes made
 * a first-time Expert stare at one unchanging sentence while a reasoning model
 * worked: the Bad Example Probe's "Writing round N — a version of this work
 * that looks right and is not." and the Triad's "Writing your cards…". Measured
 * live that day on brand-new Rulebooks: 61 consecutive identical seconds on the
 * probe's round 1, 18 on a Triad deal, and 45–75 s on the walk itself. No
 * clock, no expectation, no incremental text — and elsewhere in the same
 * product (the Teach-back's paragraph, an Encore run) generation streams
 * visibly, so the only available reading of a still label is "stuck".
 *
 * THE FORCING FUNCTION is in two halves, because the defect has two halves:
 *
 *   1. the sentence itself must differ between second 1 and second 45, and must
 *      stop promising once it has been overtaken; and
 *   2. the two lanes the walk named must actually render it — a primitive
 *      nobody consumes closes nothing.
 *
 * RED against the pre-fix tree: `elapsedDetail` did not exist, and neither lane
 * imported `WorkingNotice` (part 2 fails by file content alone).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { elapsedDetail } from "../elapsed";
import { estimateSentence } from "../estimateSentence";

const REPO = join(__dirname, "..", "..", "..");

/** The lanes cold walk 6 measured as motionless, and what each one waits on. */
const MEASURED_MOTIONLESS = [
  "features/masterwork/probe/BadExampleProbe.tsx",
  "features/masterwork/triad/TriadGamePage.tsx",
];

describe("a waiting screen is never motionless", () => {
  it("says something different at second 1 and at second 45", () => {
    const usualMs = 90_000;
    const atOneSecond = elapsedDetail({ elapsedMs: 1_000, usualMs });
    const atFortyFive = elapsedDetail({ elapsedMs: 45_000, usualMs });
    expect(atOneSecond).not.toBe(atFortyFive);
    expect(atOneSecond).toContain("1s so far");
    expect(atFortyFive).toContain("45s so far");
    // And it says how long this kind of work takes, which is the other half of
    // what a person watching a still screen is actually asking.
    expect(atOneSecond).toContain("usually takes");
  });

  it("stops promising once the promise has been overtaken", () => {
    const usualMs = 60_000;
    const late = elapsedDetail({ elapsedMs: 200_000, usualMs });
    expect(late).not.toContain("usually takes");
    expect(late).toContain("longer than usual");
    expect(late).toContain("Nothing has failed");
    expect(
      elapsedDetail({
        elapsedMs: 200_000,
        usualMs,
        keepsGoingWithoutYou: true,
      }),
    ).toContain("keeps going without you");
  });

  it("flips to 'longer than usual' at the same moment the sentence beside it does", () => {
    // Two waiting lines on one screen that disagree about whether a run is late
    // are worse than either alone, so both read one grace factor.
    const usualMs = 60_000;
    const justBefore = usualMs * 1.5 - 1_000;
    const justAfter = usualMs * 1.5 + 1_000;
    const sentence = (elapsedMs: number): string =>
      estimateSentence({ elapsedMs, usualMs, doing: "Building", steps: [], shape: "sequence" });
    expect(sentence(justBefore)).toContain("usually takes");
    expect(elapsedDetail({ elapsedMs: justBefore, usualMs })).toContain(
      "usually takes",
    );
    expect(sentence(justAfter)).toContain("longer than usual");
    expect(elapsedDetail({ elapsedMs: justAfter, usualMs })).toContain(
      "longer than usual",
    );
  });

  it("never invents a percentage", () => {
    // A fabricated bar is a lie told slowly: nothing on this path knows a
    // fraction of anything.
    for (const ms of [0, 5_000, 45_000, 500_000]) {
      expect(elapsedDetail({ elapsedMs: ms, usualMs: 90_000 }) ?? "").not.toMatch(
        /\d+\s*%/,
      );
    }
  });

  it.each(MEASURED_MOTIONLESS)("%s renders the honest waiting line", (rel) => {
    const source = readFileSync(join(REPO, rel), "utf8");
    expect(source).toContain("WorkingNotice");
  });
});
