/**
 * 🚨 WALK 22, DEFECT C — NO SLUG-SHAPED RULE REFERENCE REACHES THE EXPERT.
 *
 * The finished deliverable's "Diagnostics Before Quoting" section printed
 *
 *   moisture-reading / straight-crack / greenboard / override-in-writing /
 *   Tap every tile on a floor, not just the stained ones — not applicable.
 *
 * Four references the walk-13/19 resolver (exact ids + segment-boundary
 * prefixes) could not tie to a rule, printed as raw shorthand. Two reasons,
 * both in the resolver:
 *   · " / " was not a list separator, so the line never PROVED itself a
 *     citation list and nothing in it was eligible to become words;
 *   · `greenboard` is one word, invisible to the hyphenated-handle scan, and
 *     it sat between two members so the run broke there.
 * And a citation that quotes a rule's NAME as a slug was never indexed.
 *
 * Two fixtures. The first is the rule set the brief names — the four tokens
 * are the slugs of four rule NAMES — and every one must become its rule. The
 * second is the walk's ACTUAL payload (`workflow.run` d1b55499-…, Rulebook
 * f3fefbaf-…, read from the live DB): there the four are genuinely
 * unresolvable (`moisture-reading` opens three rules; nothing is named
 * "straight crack"), so each must read as plain quoted words, never a slug.
 *
 * RED before the fix: case 1 printed all four raw; case 2 printed all four
 * raw plus `override-in-writing` again in the next sentence.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildRuleCitationIndex,
  linkRuleCitations,
  plainRuleCitations,
} from "../ruleCitations";
import type { RulebookRule } from "../types";

const LINE =
  "- moisture-reading / straight-crack / greenboard / override-in-writing / tap-every-tile-on-a-floor — not applicable.";
const FOUR = ["moisture-reading", "straight-crack", "greenboard", "override-in-writing"];

function rule(id: string, name: string): RulebookRule {
  return { id, name } as unknown as RulebookRule;
}

/** A tile contractor's Rulebook whose rule NAMES are what the ruling quoted. */
const NAMED_RULES = [
  rule("pin-meter-before-any-number", "Moisture reading"),
  rule("structural-movement-check", "Straight crack"),
  rule("substrate-red-flag", "Greenboard"),
  rule("put-it-in-writing", "Override in writing"),
  rule("tap-every-tile-on-a-floor-not-just-the-stained-o", "Tap every tile on a floor, not just the stained ones"),
  rule("three-verdicts", "The three possible verdicts"),
];

function slugsIn(text: string): string[] {
  return text.match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) ?? [];
}

describe("a citation that quotes a rule's name as a slug reads as the rule", () => {
  const index = buildRuleCitationIndex("rb-tile", NAMED_RULES);

  it("each of the four resolves to its rule, linked", () => {
    const out = linkRuleCitations(LINE, index);
    expect(out).toContain("[Moisture reading](/masterwork/rb-tile#");
    expect(out).toContain("[Straight crack](/masterwork/rb-tile#");
    expect(out).toContain("[Greenboard](/masterwork/rb-tile#");
    expect(out).toContain("[Override in writing](/masterwork/rb-tile#");
    expect(out).toContain("[Tap every tile on a floor, not just the stained ones]");
  });

  it("the plain rendering carries no slug at all", () => {
    const out = plainRuleCitations(LINE, index);
    for (const token of FOUR) expect(out).not.toContain(token);
    expect(slugsIn(out)).toEqual([]);
  });

  it("a name slug two rules share is never resolved to either", () => {
    const twin = buildRuleCitationIndex("rb", [
      rule("a-one", "Greenboard"),
      rule("b-two", "Greenboard"),
      rule("tap-every-tile-on-a-floor", "Tap every tile"),
    ]);
    const out = linkRuleCitations("greenboard-x / greenboard / tap-every-tile-on-a-floor", twin);
    expect(out).not.toContain("](/masterwork/rb#rule-a-one)");
    expect(out).not.toContain("](/masterwork/rb#rule-b-two)");
  });
});

describe("the walk's own payload: an unresolvable citation reads as words", () => {
  const fixture: { rulebookId: string; ruling: string; rules: RulebookRule[] } =
    JSON.parse(
      readFileSync(resolve(__dirname, "fixtures/cold-walk-22-ruling.json"), "utf8"),
    );
  const index = buildRuleCitationIndex(fixture.rulebookId, fixture.rules);

  it("never renders a citation-list member with hyphens", () => {
    for (const render of [linkRuleCitations, plainRuleCitations]) {
      const out = render(fixture.ruling, index);
      for (const token of FOUR.filter((t) => t.includes("-"))) {
        expect(out).not.toContain(token);
      }
      // The one-word member appears only as a quoted reference.
      expect(out).not.toMatch(/(?<!\u201c)greenboard(?!\u201d)/);
      expect(out).toContain("“moisture reading”");
      expect(out).toContain("“straight crack”");
      expect(out).toContain("“greenboard”");
      expect(out).toContain("“override in writing”");
    }
  });

  it("the member that IS a rule still links to it", () => {
    const out = linkRuleCitations(fixture.ruling, index);
    expect(out).toContain("[Tap every tile on a floor, not just the stained ones](");
    expect(out).toContain("[The three possible verdicts](");
  });

  it("ordinary hyphenated English outside a proven list is untouched", () => {
    const out = plainRuleCitations(
      "A mud-set floor and a well-known tile-by-tile tap test.",
      index,
    );
    expect(out).toBe("A mud-set floor and a well-known tile-by-tile tap test.");
  });
});
