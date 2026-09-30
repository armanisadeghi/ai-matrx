import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSourceRef } from "@ai-matrx/agents/sources";
import { DELIVERY_CHOICES, DELIVERY_WORDS, deliveryPatch, sourceDelivery } from "./delivery";

/**
 * V1-A (verifier shots 07/08): the Source card for a stored PDF said "Nothing is
 * copied in. The AI looks up only what it needs." while "Review what goes in" for
 * the SAME Source said "Include the text" — and the request carried the text. The
 * card rendered chat's attachment editor, whose wording describes chat's
 * look-up-by-default (and whose extra copies / exclusions the Source path never
 * reads). Delivery now has ONE source of truth that the card, the review and the
 * planner all read.
 */
const PDF = "0b8d1a52-2f0c-4a57-9d2c-3a6f0e8f1c11";
const here = __dirname;
const read = (rel: string) => readFileSync(join(here, rel), "utf8");

describe("delivery — one source of truth", () => {
  it("reads the contract default: no delivery means the text goes in", () => {
    expect(sourceDelivery(createSourceRef("file", PDF))).toBe("direct");
    expect(sourceDelivery(createSourceRef("file", PDF, { delivery: "direct" }))).toBe("direct");
    expect(sourceDelivery(createSourceRef("file", PDF, { delivery: "context" }))).toBe("context");
    expect(sourceDelivery(null)).toBe("direct");
  });

  it("writes it the way the request carries it", () => {
    const ref = createSourceRef("file", PDF, {
      ...deliveryPatch("context"),
    });
    expect(ref.delivery).toBe("context");
    const back = createSourceRef("file", PDF, { ...ref, ...deliveryPatch("direct") });
    expect(back.delivery).toBeUndefined();
    // Looking a Source up sends no text, so its parts and size limit are dropped.
    expect(deliveryPatch("context")).toEqual({
      delivery: "context",
      include_segments: undefined,
      max_chars: undefined,
    });
  });

  it("says the text goes in when it does — never the look-up sentence", () => {
    expect(DELIVERY_WORDS.direct.hint).toBe("Sent in full");
    expect(DELIVERY_WORDS.direct.hint).not.toMatch(/nothing/i);
    expect(DELIVERY_CHOICES.map((c) => c.value)).toEqual(["direct", "context"]);
  });

  it("the card and the review take their delivery words from this module only", () => {
    const card = read("components/SourceCard.tsx");
    const row = read("review/SourceReviewRow.tsx");
    // The card no longer borrows chat's attachment editor (its "Nothing is copied
    // in" is chat's semantics, and its promote/exclude are ignored by the Source path).
    expect(card).not.toMatch(/ResourceFamilyPolicyEditor/);
    for (const [name, text] of [["SourceCard", card], ["SourceReviewRow", row]] as const) {
      expect({ name, imports: /from "\.\.\/delivery"/.test(text) }).toEqual({ name, imports: true });
      for (const words of Object.values(DELIVERY_WORDS)) {
        expect({ name, hardcoded: text.includes(words.hint) }).toEqual({ name, hardcoded: false });
      }
      expect({ name, lie: /Nothing is copied in/.test(text) }).toEqual({ name, lie: false });
    }
  });
});
