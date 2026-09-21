/**
 * 🚨 WALK 19, DEFECT B — NO HYPHENATED RULE ID AND NO "Rule id:" LABEL EVER
 * REACHES THE EXPERT.
 *
 * The fixture is not written by hand. `fixtures/cold-walk-19-ruling.json` is
 * the ACTUAL payload of the walk's run — `workflow.run`
 * 3a3bb7b5-b54e-4be2-b99b-92b550087f99, `show.ruling`, 10,863 characters —
 * beside the ACTUAL 66 rules of the Rulebook it was citing
 * (`platform.rulebook` d4eeb99e-2c8f-4511-95ad-69e4bb17c273). Both were read
 * out of the live database. The defect the walk photographed is inside this
 * text, so a guard over it cannot be satisfied by an example that flatters the
 * fix.
 *
 * ROOT CAUSE, from that payload: the provider WAS mounted and the index WAS
 * populated — ten citations in this same document resolved perfectly, which is
 * only possible with a live index. The nine that reached the Expert raw are the
 * ones the Chief SHORTENED at segment boundaries (`no-stain-attic-check` for
 * `no-stain-attic-check-looks-for-rust-and-frost-no`), three of them marked
 * with its own ellipsis. Exact-match indexing cannot see them.
 *
 * PROVEN FAILING FIRST, four ways, against the code as it stood:
 *   · delete the prefix pass in `buildRuleCitationIndex`
 *     → "every citation reads as the rule" reddens with eight raw slugs.
 *   · delete the `RULE_ID_LABEL` replacement
 *     → "the label is never 'Rule id:'" reddens.
 *   · delete the `TRUNCATION_MARK` consumption
 *     → "a resolved citation keeps no truncation mark" reddens.
 *   · delete the `provenRuns` branch
 *     → "a slug we cannot prove still reaches her as words" reddens.
 *
 * AND THE OTHER DIRECTION, which is the half that makes prefix resolution
 * honest rather than fuzzy: this same document writes `twenty-seven-year`,
 * `low-slope`, `tear-off`, `whole-roof`, `Hold-the-slot`, `sign-today` and
 * `beat-the-price-increase` as ordinary English, and three of those open a
 * stored rule id. Every one of them must survive byte-for-byte.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildRuleCitationIndex,
  linkRuleCitations,
  plainRuleCitations,
} from "../ruleCitations";
import type { RulebookRule } from "../types";

interface Fixture {
  rulebookId: string;
  ruling: string;
  rules: RulebookRule[];
}

const FIXTURE: Fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, "fixtures/cold-walk-19-ruling.json"),
    "utf8",
  ),
);

const INDEX = buildRuleCitationIndex(FIXTURE.rulebookId, FIXTURE.rules);

/** Every hyphenated lowercase token still standing in a rendered document. */
function slugsIn(text: string): string[] {
  return [...new Set(text.match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) ?? [])];
}

/**
 * The nine the walk photographed, verbatim from its README. Three carry the
 * model's ellipsis in the stored text; `every-flashing-repair-…` resolved even
 * before this fix and is the proof the index was live.
 */
const THE_NINE = [
  "within-two-points",
  "3-6-point-spread",
  "6-point-spread",
  "deck-photo-overrides-the-meter",
  "chimney-within-six-feet",
  "no-stain-attic-check",
  "daylight-at-ridge",
  "daylight-at-penetration",
];

/** Ordinary English in the SAME document. Three of these open a stored id. */
const ENGLISH_IN_THE_SAME_DOCUMENT = [
  "twenty-seven-year",
  "twenty-five-year",
  "low-slope",
  "tear-off",
  "whole-roof",
  "ten-year",
  "sign-today",
  "beat-the-price-increase",
  "shingle-patch",
];

describe("cold walk 19, defect B — the real run's ruling", () => {
  it("carries the defect before it is rendered (the fixture is honest)", () => {
    for (const slug of THE_NINE) {
      expect(FIXTURE.ruling).toContain(slug);
    }
    expect(FIXTURE.ruling).toMatch(/\bRule ids?:/);
  });

  it("resolves every one of the nine to the rule's own name", () => {
    const read = plainRuleCitations(FIXTURE.ruling, INDEX);
    for (const slug of THE_NINE) {
      expect(read).not.toContain(slug);
    }
  });

  it("leaves no bare hyphenated rule id anywhere in the document", () => {
    const standing = slugsIn(plainRuleCitations(FIXTURE.ruling, INDEX));
    const stored = new Set(FIXTURE.rules.map((rule) => rule.id));
    // A token at or above the floor that opens a stored id is a SHORTENING and
    // must be gone. Below the floor (`tear-off`, `low-slope`, `3-6`) it is
    // English the resolver is required to leave alone, and the last assertion
    // of this file proves those three are still here.
    const shortenings = standing.filter(
      (slug) =>
        slug.split("-").length >= 3 &&
        FIXTURE.rules.some((rule) => rule.id.startsWith(`${slug}-`)),
    );
    expect(standing.filter((slug) => stored.has(slug))).toEqual([]);
    expect(shortenings).toEqual([]);
  });

  it("never prints the label 'Rule id:' or 'Rule ids:'", () => {
    const read = plainRuleCitations(FIXTURE.ruling, INDEX);
    expect(read).not.toMatch(/\bRules?\s+ids?\s*:/i);
    // The sentence keeps its connective — the label is reworded, not deleted.
    expect(read).toMatch(/\bRules?:/);
  });

  it("keeps no truncation mark on a citation it un-shortened", () => {
    const read = plainRuleCitations(FIXTURE.ruling, INDEX);
    expect(FIXTURE.ruling).toContain("within-two-points…");
    expect(read).not.toContain("…");
  });

  it("writes a slug it cannot prove as the words that slug already said", () => {
    // `daylight-at-penetration` is NOT a prefix of any stored id — the model
    // dropped an interior word — so it is never claimed for a rule. It stands
    // in a run whose other five members are proven citations, so it reaches
    // her as words rather than as a slug.
    expect(
      FIXTURE.rules.some((rule) =>
        rule.id.startsWith("daylight-at-penetration"),
      ),
    ).toBe(false);
    const read = plainRuleCitations(FIXTURE.ruling, INDEX);
    expect(read).toContain("daylight at penetration");
    expect(read).not.toContain("daylight-at-penetration");
  });

  it("leaves the document's ordinary hyphenated English byte-for-byte", () => {
    const read = plainRuleCitations(FIXTURE.ruling, INDEX);
    for (const word of ENGLISH_IN_THE_SAME_DOCUMENT) {
      expect(read).toContain(word);
    }
    expect(read).toContain("Hold-the-slot");
  });

  it("links a shortened citation to the rule it names, not to a guess", () => {
    const linked = linkRuleCitations(FIXTURE.ruling, INDEX);
    const target = FIXTURE.rules.find(
      (rule) => rule.id === "no-stain-attic-check-looks-for-rust-and-frost-no",
    );
    expect(target).toBeDefined();
    expect(linked).toContain(
      `(/masterwork/${FIXTURE.rulebookId}#rule-no-stain-attic-check-looks-for-rust-and-frost-no)`,
    );
  });
});

describe("a shortened handle is resolved only when it can be PROVEN", () => {
  const rules = [
    { id: "photograph-the-crown-and-the-counterflashing", name: "A" },
    { id: "photograph-the-crown-before-any-removal", name: "B" },
    { id: "trace-leak-to-actual-entry-point", name: "C" },
  ] as RulebookRule[];
  const index = buildRuleCitationIndex("rb", rules);

  it("resolves a prefix exactly one rule answers to", () => {
    expect(plainRuleCitations("trace-leak-to-actual", index)).toBe("C");
  });

  it("drops a prefix two rules would both answer to", () => {
    const shared = "photograph-the-crown-and";
    expect(plainRuleCitations("photograph-the-crown", index)).toBe(
      "photograph-the-crown",
    );
    expect(plainRuleCitations(shared, index)).toBe("A");
  });

  it("never consults a two-segment prefix, because that is English", () => {
    expect(plainRuleCitations("trace-leak", index)).toBe("trace-leak");
  });

  it("never lets a prefix outrank a whole stored id", () => {
    const both = buildRuleCitationIndex("rb", [
      { id: "tear-off", name: "Tear off" },
      { id: "tear-off-ten-year-workmanship", name: "Ten years" },
    ] as RulebookRule[]);
    expect(plainRuleCitations("tear-off", both)).toBe("Tear off");
  });
});
