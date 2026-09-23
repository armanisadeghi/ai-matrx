/**
 * A WAITING CLOCK NEVER SPEAKS IN MILLISECONDS — cold walk 22 (friction).
 *
 * The New Masterwork start notice read "0ms so far — this usually takes a few
 * seconds." Nobody waits in milliseconds, and a clock that opens on zero reads
 * as a clock that never started. The rule, at the one shared clock every
 * waiting surface reads: nothing until one second, then whole seconds.
 *
 * RED before the fix: elapsedDetail(0) returned "0ms so far — …" and
 * formatElapsed(1_500) returned "1.5s"-or-ms-shaped text.
 */
import { elapsedDetail, formatElapsed } from "../elapsed";

describe("the waiting clock", () => {
  it("says nothing about time before the first whole second", () => {
    for (const ms of [0, 1, 250, 999]) {
      expect(elapsedDetail({ elapsedMs: ms, usualMs: 3_000 })).toBeNull();
    }
  });

  it("speaks in whole seconds from one second on, never milliseconds", () => {
    for (const ms of [1_000, 1_500, 3_999, 45_250, 125_700]) {
      const line = elapsedDetail({ elapsedMs: ms, usualMs: 3_000 }) ?? "";
      expect(line).toMatch(/\d+s so far/);
      expect(line).not.toMatch(/\d+ms\b/);
      expect(line).not.toMatch(/\d+\.\d+s/);
    }
    expect(elapsedDetail({ elapsedMs: 3_400, usualMs: 6_000 })).toContain(
      "3s so far",
    );
  });

  it("formatElapsed never returns milliseconds to any caller", () => {
    for (const ms of [0, 12, 999, 1_001, 59_999]) {
      expect(formatElapsed(ms)).not.toMatch(/ms\b/);
      expect(formatElapsed(ms)).not.toMatch(/\./);
    }
  });
});
