import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DELIVERY_WORDS } from "@ai-matrx/agents/sources/runtime";

/**
 * V1-A (verifier shots 07/08): the Source card for a stored PDF said "Nothing is
 * copied in. The AI looks up only what it needs." while "Review what goes in" for
 * the SAME Source said "Include the text" — and the request carried the text.
 * Delivery has ONE source of truth — `@ai-matrx/agents/sources/runtime`
 * (`delivery.ts`, whose own tests prove the rule) — and the card and the review
 * both take their words from it, never a copy.
 */
const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");

it("the card and the review take their delivery words from the package only", () => {
  const card = read("components/SourceCard.tsx");
  const row = read("review/SourceReviewRow.tsx");
  // The card never borrows chat's attachment editor (its "Nothing is copied
  // in" is chat's semantics, and its promote/exclude are ignored by the Source path).
  expect(card).not.toMatch(/ResourceFamilyPolicyEditor/);
  for (const [name, text] of [["SourceCard", card], ["SourceReviewRow", row]] as const) {
    expect({ name, imports: /DELIVERY_WORDS[\s\S]*?from "@ai-matrx\/agents\/sources\/runtime"/.test(text) }).toEqual({
      name,
      imports: true,
    });
    for (const words of Object.values(DELIVERY_WORDS)) {
      expect({ name, hardcoded: text.includes(words.hint) }).toEqual({ name, hardcoded: false });
    }
    expect({ name, lie: /Nothing is copied in/.test(text) }).toEqual({ name, lie: false });
  }
});
