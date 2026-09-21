/**
 * Walk 18, defect D — the finished deliverable printed one machine field name.
 *
 * `/masterwork/encore/<id>?run=<run>` → The Audit Reckoned. Twelve thousand
 * six hundred and forty-two characters of otherwise flawless English — the
 * document an Expert hands a customer or a new hire — and in the middle of it,
 * verbatim:
 *
 *   **Editor's `violations_not_fixed: []`** — OVERRULED as premature.
 *
 * THE PAYLOAD BELOW IS REAL. It is copied out of the ruling this walk
 * produced: `chat.message` `e789210e-11cf-4584-8961-cbe7ca39b78a`, part 2,
 * written 2026-09-21T12:11:34Z by the run on `walk18-Drain and Heater Verdict`
 * (`3b12f1fd-526b-45c4-a201-1c47c9063e81`). The rule id in the paragraph below
 * it is that Rulebook's own stored id, with that Rulebook's own stored name.
 *
 * The token is NOT the agent's invention: `violations_not_fixed` is a key out
 * of the Editor's output schema, which we declared and handed the model
 * (`aidream/services/masterworks/build.py`). Quoting what it was given is
 * correct behaviour for an agent, so the reading side owns turning it into
 * words — exactly as it already owns `not_applicable` (walk 13) and the
 * truncated rule ids (walk 12, D14).
 *
 * PROVEN FAILING FIRST against the code as it stood: with `fieldSpanWords` /
 * `BARE_FIELD` removed from `ruleCitations.ts`, "the field name" and "the
 * value" redden while every other leg below stays green.
 */

import {
  buildRuleCitationIndex,
  deliverableLine,
  linkRuleCitations,
  plainRuleCitations,
} from "../ruleCitations";
import type { RulebookRule } from "../types";

const RULEBOOK_ID = "3b12f1fd-526b-45c4-a201-1c47c9063e81";

/** The two rules this excerpt of the ruling actually cites, as stored. */
const RULES = [
  {
    id: "never-quote-a-replacement-on-the-same-visit-you",
    name: "Never quote a replacement on the same visit you shut off a customer's water",
  },
  {
    id: "no-quote-without-documented-evidence",
    name: "No quote without documented evidence",
  },
] as unknown as RulebookRule[];

/** Verbatim from the run's own ruling. */
const RULING = [
  "**Editor's removal of the pressure close** — SUSTAINED. There is no price to hold.",
  "",
  "**Editor's `violations_not_fixed: []`** — OVERRULED as premature. The same-visit",
  "violation was \"fixed\" by inventing restoration; the two-clogs violation was",
  "half-fixed. Both are closed by the amendments here.",
  "",
  "## Conflicts With Common Practice",
  "",
  "1. **`never-quote-a-replacement-on-the-same-visit-you`** — Convention says strike",
  "while the homeowner is motivated.",
].join("\n");

const index = buildRuleCitationIndex(RULEBOOK_ID, RULES);

describe("a machine field name never reaches the Expert's deliverable", () => {
  const rendered = linkRuleCitations(RULING, index);

  it("the field name is gone, in every rendering of the deliverable", () => {
    expect(RULING).toContain("violations_not_fixed");
    expect(rendered).not.toContain("violations_not_fixed");
    expect(plainRuleCitations(RULING, index)).not.toContain(
      "violations_not_fixed",
    );
    expect(deliverableLine(RULING, index)).not.toContain(
      "violations_not_fixed",
    );
  });

  it("the field name reads as the words it always stood for", () => {
    expect(rendered).toContain("Editor's violations not fixed: none");
  });

  it("the empty list reads as a word, never as JSON", () => {
    expect(rendered).not.toContain("[]");
  });

  it("does it with NO Rulebook in hand — it needs no rules, only our own shapes", () => {
    const alone = linkRuleCitations(RULING, null);
    expect(alone).not.toContain("violations_not_fixed");
    expect(alone).toContain("violations not fixed: none");
  });

  it("never touches the rule citation beside it", () => {
    expect(rendered).toContain(
      "[Never quote a replacement on the same visit you shut off a customer's water]" +
        `(/masterwork/${RULEBOOK_ID}#`,
    );
  });
});

describe("what it must never touch", () => {
  it("leaves a fenced code block alone, field names and all", () => {
    const fenced = [
      "Here is what the Editor sent:",
      "",
      "```json",
      '{ "violations_not_fixed": [], "word_count_after": 96 }',
      "```",
    ].join("\n");
    expect(linkRuleCitations(fenced, index)).toContain(
      '{ "violations_not_fixed": [], "word_count_after": 96 }',
    );
  });

  it("leaves a real inline code span alone", () => {
    // Not a field: a call, an assignment, a path. The shape test is what keeps
    // this file from editing somebody's actual code.
    for (const span of [
      "`build_the_thing(x)`",
      "`a_b = compute(y)`",
      "`services/masterworks/build.py`",
      "`SELECT * FROM x`",
    ]) {
      expect(linkRuleCitations(`Run ${span} first.`, index)).toContain(span);
    }
  });

  it("leaves ordinary two-word technical English in prose alone", () => {
    // Loose in prose the floor is three segments — the same rule
    // `personSentence` applies, and for the same reason.
    const prose = "The word_count in the letter went down.";
    expect(linkRuleCitations(prose, index)).toContain("word_count");
  });

  it("still un-mangles the declared enum value walk 13 found", () => {
    expect(linkRuleCitations("Status: not_applicable.", index)).toContain(
      "not applicable",
    );
  });
});
