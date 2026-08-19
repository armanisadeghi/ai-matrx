/**
 * THE RULEBOOK DOCUMENT — the bound variable that cured disease D4 for the
 * Scout and the Conductor. These pin the two properties the cure depends on:
 * the document is COMPLETE (an agent never needs a tool call to learn what the
 * Rulebook holds) and it is NEVER BLANK (an empty Rulebook says so in words,
 * because an empty string is indistinguishable from a wiring failure and is
 * refused by `missingRequiredVariables`).
 */

import { missingRequiredVariables } from "@/features/agents/mandates/contract";
import { renderRulebookDocument } from "../rulebookDocument";
import type { Rulebook, RulebookRule } from "../../types";

const rule = (over: Partial<RulebookRule>): RulebookRule => ({
  id: "r1",
  name: "Never open with an apology",
  section: "V",
  statement: "Never open a reply with an apology.",
  severity: "major",
  ...over,
});

const rulebook = (over: Partial<Rulebook> = {}): Rulebook =>
  ({
    id: "8d1d4f08-c4c0-4e1d-ba9a-51d5d7bf69fb",
    name: "Arman's SEO method",
    description: "How I actually pick keywords.",
    status: "active",
    version: 12,
    sections: { V: { label: "Voice" } },
    rules: [rule({})],
    source: { title: "Twenty years of client work" },
    metadata: { intake: { goal: "Rank client pages", stakes: "Lost revenue" } },
    ...over,
  }) as unknown as Rulebook;

describe("renderRulebookDocument", () => {
  it("carries identity, intake, sections and the full rule", () => {
    const doc = renderRulebookDocument(rulebook());
    expect(doc).toContain("Arman's SEO method");
    expect(doc).toContain("Rank client pages"); // intake
    expect(doc).toContain("Voice (V)"); // section
    expect(doc).toContain("Never open a reply with an apology."); // statement
    expect(doc).toContain("[r1]"); // the citable handle
  });

  it("states plainly that an EMPTY Rulebook is empty — never a blank string", () => {
    const doc = renderRulebookDocument(rulebook({ rules: [] }));
    expect(doc.trim().length).toBeGreaterThan(0);
    expect(doc).toContain("NO rules yet");
    // …and therefore satisfies the run-time precondition rather than tripping
    // the refusal that a genuine wiring failure must trip.
    expect(
      missingRequiredVariables(
        {
          requiredVariables: ["rulebook_document"],
          requiredContextPolicyKeys: [],
          requiredOutputKeys: [],
          spillVariables: [],
        },
        { rulebook_document: doc },
      ),
    ).toEqual([]);
  });

  it("breaks out the Expert's open review feedback so it cannot be missed", () => {
    const doc = renderRulebookDocument(
      rulebook({
        rules: [
          rule({ id: "r1", rejected: true, feedback: "Too absolute." }),
          rule({ id: "r2", name: "Cite the source", feedback: "Add detection." }),
        ],
      }),
    );
    expect(doc).toContain("OPEN REVIEW FEEDBACK");
    expect(doc).toContain("REJECTED · Never open with an apology [r1] — Too absolute.");
    expect(doc).toContain("CHANGE REQUESTED · Cite the source [r2] — Add detection.");
  });

  it("never drops a rule whose section is not declared", () => {
    const doc = renderRulebookDocument(
      rulebook({ rules: [rule({ id: "r9", section: "ZZZ", name: "Orphan" })] }),
    );
    expect(doc).toContain("Not yet filed into a section");
    expect(doc).toContain("Orphan");
  });

  it("renders documented connections, so a rule is never read as standalone", () => {
    const doc = renderRulebookDocument(
      rulebook({
        rules: [
          rule({
            relates_to: [
              { rule_id: "r2", kind: "exception_to", note: "local clients" },
            ],
          }),
        ],
      }),
    );
    expect(doc).toContain("Connected: exception_to r2 — local clients");
  });
});
