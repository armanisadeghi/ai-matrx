/**
 * The STREAMING reader behind the bulk-enrich cascade: a live
 * `card_enrichment` envelope → the value the registered kind component draws.
 *
 * The whole point of the cascade is that layers appear one at a time as they
 * are written, so these pin the mid-stream rules: a layer with no text yet is
 * not shown (an empty labelled box is noise), and a layer whose `kind` hasn't
 * arrived is shown WITHOUT a kind rather than guessed into the wrong bucket.
 */

import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import {
  cardEnrichmentValue,
  streamingEnrichmentDetails,
} from "../cardEnrichmentEnvelope";

const envelopeOf = (
  kind: string,
  value: Record<string, unknown>,
): CanonicalBlockIR =>
  ({ root: { kind, value, status: "streaming" } }) as unknown as CanonicalBlockIR;

describe("streamingEnrichmentDetails", () => {
  it("shows each layer the moment it has text", () => {
    const details = streamingEnrichmentDetails(
      envelopeOf("card_enrichment", {
        details: [
          { __kind: "card_detail", kind: "helper", text: "Think of it as" },
        ],
      }),
    );
    expect(details).toEqual([{ kind: "helper", text: "Think of it as" }]);
  });

  it("grows layer by layer across flushes", () => {
    const first = streamingEnrichmentDetails(
      envelopeOf("card_enrichment", {
        details: [{ kind: "helper", text: "one" }],
      }),
    );
    const second = streamingEnrichmentDetails(
      envelopeOf("card_enrichment", {
        details: [
          { kind: "helper", text: "one" },
          { kind: "example", text: "two" },
        ],
      }),
    );
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
  });

  it("withholds a layer whose text has not started", () => {
    const details = streamingEnrichmentDetails(
      envelopeOf("card_enrichment", {
        details: [
          { kind: "helper", text: "here" },
          { kind: "example" },
          { kind: "hint", text: "   " },
        ],
      }),
    );
    expect(details).toEqual([{ kind: "helper", text: "here" }]);
  });

  it("never guesses a kind that has not arrived", () => {
    const details = streamingEnrichmentDetails(
      envelopeOf("card_enrichment", { details: [{ text: "no kind yet" }] }),
    );
    expect(details).toEqual([{ text: "no kind yet" }]);
    expect(details[0]).not.toHaveProperty("kind");
  });

  it("returns nothing for a null envelope, another kind, or a missing list", () => {
    expect(streamingEnrichmentDetails(null)).toEqual([]);
    expect(
      streamingEnrichmentDetails(
        envelopeOf("flashcard_set", { cards: [{ front: "x" }] }),
      ),
    ).toEqual([]);
    expect(streamingEnrichmentDetails(envelopeOf("card_enrichment", {}))).toEqual(
      [],
    );
  });
});

describe("cardEnrichmentValue", () => {
  it("wraps layers as a card_enrichment instance the kind component consumes", () => {
    expect(
      cardEnrichmentValue([{ kind: "mnemonic", text: "ROY G BIV" }]),
    ).toEqual({
      __kind: "card_enrichment",
      details: [{ __kind: "card_detail", kind: "mnemonic", text: "ROY G BIV" }],
    });
  });

  it("omits an absent kind instead of emitting an empty one", () => {
    const value = cardEnrichmentValue([{ text: "still arriving" }]);
    const detail = (value.details as Record<string, unknown>[])[0];
    expect(detail).not.toHaveProperty("kind");
    expect(detail.text).toBe("still arriving");
  });

  it("gives a streamed layer and a stored layer the SAME rendered shape", () => {
    const streamed = cardEnrichmentValue([{ kind: "helper", text: "same" }]);
    const stored = cardEnrichmentValue([{ kind: "helper", text: "same" }]);
    expect(streamed).toEqual(stored);
  });
});
