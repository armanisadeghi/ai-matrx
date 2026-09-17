/**
 * features/capture-ladder/__tests__/ladderLaw.test.ts
 *
 * THE LADDER LAW, guarded on the client.
 *
 * Contract: common-docs/projects/acquisition-frontier/extension-ladder/CONTRACT.md §1
 *
 *   "A capture may only move from rung n to rung n+1. It may STOP at any rung
 *    … but a stop is recorded with its reason and is visible; it is never a
 *    jump."
 *
 * The Python half asserts this where trails are WRITTEN
 * (`matrx_scraper/ladder.py::assert_no_skipped_rung`). This asserts it where
 * they are READ, because a client that renders a jump as if it were normal is
 * exactly how a silent skip survives a server-side guard: the row looks fine on
 * screen, so nobody ever goes looking.
 *
 * ── Why these cases and not a snapshot ────────────────────────────────────
 * Every case below is a trail a REAL defect would produce — a rung-2 failure
 * escalating straight to the person (the one the contract names), a stop
 * replayed as a step, a rung key that does not exist. None of them is
 * manufactured to match the implementation's shape; each is stated in the
 * contract's own terms first and only then run through the guard.
 */

import {
  assertNoSkippedRung,
  skippedRungReason,
  SkippedRungError,
  RUNGS,
} from "@/features/capture-ladder/types";

describe("assertNoSkippedRung — the ladder law", () => {
  it("accepts every lawful prefix of the ladder", () => {
    // A capture may stop at any rung, so each prefix is a real, lawful trail.
    for (let i = 1; i <= RUNGS.length; i++) {
      const trail = RUNGS.slice(0, i);
      expect(() => assertNoSkippedRung(trail)).not.toThrow();
    }
  });

  it("accepts an empty trail (nothing ran yet is not a skip)", () => {
    expect(() => assertNoSkippedRung([])).not.toThrow();
  });

  it("REFUSES the jump the contract names: browser straight to the person", () => {
    // CONTRACT.md §2: "Reasons that go straight past rung 3 to rung 4 as the
    // first offer: None. Rung 3 is always attempted first."
    expect(() =>
      assertNoSkippedRung(["http", "browser", "human_drive"]),
    ).toThrow(SkippedRungError);
  });

  it("REFUSES a jump from the very first rung to the person's own browser", () => {
    expect(() => assertNoSkippedRung(["http", "own_browser"])).toThrow(
      SkippedRungError,
    );
  });

  it("REFUSES a trail that skips two rungs at once", () => {
    expect(() => assertNoSkippedRung(["http", "human_drive"])).toThrow(
      SkippedRungError,
    );
  });

  it("names the rungs that were skipped, in words a person could read", () => {
    const reason = skippedRungReason(["http", "human_drive"]);
    expect(reason).toContain("own_browser");
    expect(reason).toContain("never skip");
  });

  it("REFUSES a repeated rung (a retry is not a step up the ladder)", () => {
    expect(() => assertNoSkippedRung(["http", "http"])).toThrow(
      SkippedRungError,
    );
  });

  it("REFUSES a backwards step", () => {
    expect(() =>
      assertNoSkippedRung(["http", "browser", "http"]),
    ).toThrow(SkippedRungError);
  });

  it("REFUSES a rung key that is not one of the four", () => {
    expect(() => assertNoSkippedRung(["http", "cloud_browser"])).toThrow(
      SkippedRungError,
    );
    expect(skippedRungReason(["http", "cloud_browser"])).toContain(
      "is not one of the four rungs",
    );
  });

  it("carries the offending pair on the error, so a caller can report it", () => {
    try {
      assertNoSkippedRung(["http", "human_drive"]);
      throw new Error("the guard did not throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SkippedRungError);
      expect((error as SkippedRungError).from).toBe("http");
      expect((error as SkippedRungError).to).toBe("human_drive");
    }
  });

  it("skippedRungReason returns null for a lawful trail", () => {
    expect(skippedRungReason(["http", "browser", "own_browser"])).toBeNull();
  });
});
