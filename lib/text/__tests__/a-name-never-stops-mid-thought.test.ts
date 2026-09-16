/**
 * A NAME NEVER STOPS MID-THOUGHT WITHOUT SAYING SO — a forcing function.
 *
 * Cold walk, 2026-09-16, finding #1: the Expert typed
 *
 *   "How I decide which incoming e-waste pallets need a manual sort instead
 *    of going straight to the shredder."
 *
 * and the Rulebook header rendered
 *
 *   "How I decide which incoming e-waste pallets need a manual"
 *
 * — cut on a dangling adjective, no ellipsis, nothing saying it had been cut.
 * The Vision Interview list had been fixed for exactly this a day earlier, in
 * its own private helper; the Rulebook name and the rule-saving path each had
 * their own copy of the bug. Three hand-rolled truncations, one rule.
 *
 * What this holds down, at the CLASS and at each of the three call sites:
 *   1. The invariant itself — a returned name is either the whole thought or
 *      ends in an ellipsis. There is no third outcome, and that is what lets
 *      any reader trust a name with no "…" in it.
 *   2. Cuts land on word boundaries, never inside a word.
 *   3. THE CENSUS: no caller has gone back to rolling its own. A fourth copy
 *      appearing later is how this bug returns for the fourth time.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nameFromSentence } from "../nameFromSentence";
import { titleFromVision } from "@/features/vision-interview/titleFromVision";
import { deriveRuleNameFromContent } from "@/features/masterwork/oracle/service";

/** The exact sentence from the cold walk. */
const PALLET_GOAL =
  "How I decide which incoming e-waste pallets need a manual sort instead " +
  "of going straight to the shredder.";

/** The exact string the header showed — the defect, verbatim. */
const THE_DEFECT = "How I decide which incoming e-waste pallets need a manual";

describe("the rule", () => {
  it("never returns a silently truncated name", () => {
    const name = nameFromSentence(PALLET_GOAL);
    expect(name).not.toBe(THE_DEFECT);
    expect(name.endsWith("…")).toBe(true);
  });

  it("cuts on a word boundary, never inside a word", () => {
    const body = nameFromSentence(PALLET_GOAL).replace(/…$/, "");
    expect(PALLET_GOAL.startsWith(body)).toBe(true);
    expect(body).not.toMatch(/\s$/);
    expect(
      PALLET_GOAL[body.length] === " " || PALLET_GOAL[body.length] === undefined,
    ).toBe(true);
  });

  it("uses a short sentence whole, with no ellipsis to explain away", () => {
    expect(nameFromSentence("Route every incoming pallet correctly.")).toBe(
      "Route every incoming pallet correctly.",
    );
  });

  it("marks a first sentence that left more behind", () => {
    expect(nameFromSentence("Route pallets right. Then tell me why.")).toBe(
      "Route pallets right…",
    );
  });

  it("falls back rather than naming something the empty string", () => {
    expect(nameFromSentence("   ", { fallback: "Untitled thing" })).toBe(
      "Untitled thing",
    );
  });

  it("keeps enough words to tell two of anything apart", () => {
    const a = nameFromSentence(
      "I want a simple assistant that tells me which pallets to shred right away",
    );
    const b = nameFromSentence(
      "I want a simple assistant that tells me when a client account is at risk",
    );
    expect(a).not.toBe(b);
  });
});

describe("every surface that names a person's work obeys it", () => {
  it("the Vision Interview title", () => {
    expect(titleFromVision(PALLET_GOAL).endsWith("…")).toBe(true);
  });

  it("a rule saved out of a conversation", () => {
    const name = deriveRuleNameFromContent(
      `**${PALLET_GOAL}** and then some more text entirely`,
    );
    expect(name).not.toBe(THE_DEFECT);
    expect(name.endsWith("…")).toBe(true);
  });

  it("the Rulebook name derived from the guided start's goal", () => {
    // `nameFromGoal` is private to the flow component, so the census below is
    // what proves it; this asserts the rule it now delegates to.
    const source = readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "..",
        "features/masterwork/intake/NewRulebookFlow.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("nameFromSentence(goal");
  });
});

describe("the census — nobody rolls their own again", () => {
  const CALL_SITES = [
    "features/vision-interview/titleFromVision.ts",
    "features/masterwork/oracle/service.ts",
    "features/masterwork/intake/NewRulebookFlow.tsx",
  ];

  it.each(CALL_SITES)("%s calls the one rule", (relative) => {
    const source = readFileSync(
      join(__dirname, "..", "..", "..", relative),
      "utf8",
    );
    expect(source).toContain("nameFromSentence");
    // The tell of a re-rolled copy: its own character ceiling plus its own
    // lastIndexOf(" ") walk-back, which is what all three used to have.
    expect(source).not.toMatch(/lastIndexOf\(" "\)/);
  });
});
