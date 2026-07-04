/**
 * The typed save path: one content-ir parse drives BOTH the live preview and
 * persistence. These tests prove generatedSetFromEnvelope maps a canonical
 * flashcard_set envelope to the persistable GeneratedCardSet — including the
 * title/set_title transition tolerance and zero-loss residue recovery (data
 * the active schema didn't declare still reaches the persisted cards).
 */

import { normalizeJsonRegion } from "@/features/content-ir/core/normalize";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import type { KindSchema } from "@/features/content-ir/core/kind-schema.types";
import { generatedSetFromEnvelope } from "../generated-set-from-envelope";

function envelopeFor(source: string, schemas?: Record<string, KindSchema>) {
  return normalizeJsonRegion(source, {
    schemas: schemas ?? kindRegistry.snapshotSchemas(),
    expectedRootKind: "flashcard_set",
  });
}

describe("generatedSetFromEnvelope", () => {
  it("maps the NEW shape ({ title, multi-kind cards }) to a GeneratedCardSet", () => {
    const envelope = envelopeFor(
      JSON.stringify({
        title: "Mixed Deck",
        cards: [
          {
            __kind: "flashcard",
            front: "Q1?",
            back: "A1",
            difficulty: "easy",
            topic: "cells",
          },
          {
            __kind: "enhanced_flashcard",
            front: "Q2?",
            back: "A2",
            card_kind: "enhanced",
            detailed_explanation: "Because physics.",
          },
          {
            __kind: "tiered_flashcard",
            front: "Q3?",
            back: "A3",
            subcards: [{ __kind: "basic_card", front: "Q3a?", back: "A3a" }],
          },
        ],
      }),
    );

    const set = generatedSetFromEnvelope(envelope);
    expect(set).not.toBeNull();
    expect(set?.set_title).toBe("Mixed Deck");
    expect(set?.cards).toHaveLength(3);
    expect(set?.cards[0]).toEqual({
      front: "Q1?",
      back: "A1",
      card_kind: "basic", // defaulted
      difficulty: "easy",
      topic: "cells",
    });
    expect(set?.cards[1].card_kind).toBe("enhanced");
    expect(set?.cards[2].front).toBe("Q3?");
    // Nothing internal leaks onto the persisted inputs.
    for (const card of set?.cards ?? []) {
      expect(Object.keys(card)).not.toContain("__kind");
    }
  });

  it("tolerates the OLD set_title key (transition alias) when an old-shape schema is live", () => {
    // A stale schema (old compiled build / cached warm rows) may still
    // declare set_title as THE title key — the mapper must read it.
    const oldShapeSchemas: Record<string, KindSchema> = {
      flashcard_set: {
        kind: "flashcard_set",
        fields: {
          set_title: { type: "string", required: true },
          cards: { type: "array", itemKinds: ["flashcard"], required: true },
        },
      },
      flashcard: {
        kind: "flashcard",
        fields: {
          front: { type: "string", required: true },
          back: { type: "string", required: true },
        },
      },
    };

    const envelope = envelopeFor(
      JSON.stringify({
        set_title: "Old Shape",
        cards: [{ __kind: "flashcard", front: "Q?", back: "A" }],
      }),
      oldShapeSchemas,
    );

    const set = generatedSetFromEnvelope(envelope);
    expect(set?.set_title).toBe("Old Shape");
    expect(set?.cards).toHaveLength(1);
  });

  it("returns null (→ extraction fallback) when an old-shape payload fails the NEW schema's required title", () => {
    // Against the canonical schema `title` is required — a payload carrying
    // only set_title degrades to a raw root, so the typed path steps aside
    // and the caller's extraction fallback (which also tolerates set_title)
    // persists the set.
    const envelope = envelopeFor(
      JSON.stringify({
        set_title: "Old Shape",
        cards: [{ __kind: "flashcard", front: "Q?", back: "A" }],
      }),
    );
    expect(envelope.root.kind).not.toBe("flashcard_set");
    expect(generatedSetFromEnvelope(envelope)).toBeNull();
  });

  it("recovers residue extras — fields the active schema did not declare still persist", () => {
    // Simulate a live flexible_data schema that knows NOTHING about the
    // card's topic/difficulty: they land on the residue channel, and
    // reconstructRegionValue must bring them back into the persisted cards.
    const minimalSchemas: Record<string, KindSchema> = {
      flashcard_set: {
        kind: "flashcard_set",
        fields: {
          title: { type: "string", required: true },
          cards: { type: "array", itemKinds: ["flashcard"], required: true },
        },
      },
      flashcard: {
        kind: "flashcard",
        fields: {
          front: { type: "string", required: true },
          back: { type: "string", required: true },
        },
      },
    };

    const envelope = envelopeFor(
      JSON.stringify({
        title: "Residue Deck",
        description: "root residue material",
        cards: [
          {
            __kind: "flashcard",
            front: "Q?",
            back: "A",
            topic: "residue-only",
            difficulty: "hard",
          },
        ],
      }),
      minimalSchemas,
    );

    // Sanity: the undeclared keys really did ride residue, not the snapshot.
    expect(envelope.root.value.description).toBeUndefined();
    expect(envelope.root.residue?.extra?.description).toBe(
      "root residue material",
    );
    expect(
      envelope.nodeIndex?.["cards.0"]?.residue?.extra,
    ).toEqual({ topic: "residue-only", difficulty: "hard" });

    const set = generatedSetFromEnvelope(envelope);
    expect(set?.set_title).toBe("Residue Deck");
    expect(set?.cards[0]).toEqual({
      front: "Q?",
      back: "A",
      card_kind: "basic",
      difficulty: "hard",
      topic: "residue-only",
    });
  });

  it("prefers title over set_title when both are present", () => {
    const envelope = envelopeFor(
      JSON.stringify({
        title: "Canonical",
        set_title: "Legacy",
        cards: [{ __kind: "flashcard", front: "Q?", back: "A" }],
      }),
    );
    expect(generatedSetFromEnvelope(envelope)?.set_title).toBe("Canonical");
  });

  it("skips entries missing both front and back", () => {
    const envelope = envelopeFor(
      JSON.stringify({
        title: "Sparse",
        cards: [
          { __kind: "flashcard", front: "Q?", back: "A" },
          { __kind: "flashcard", front: "", back: "" },
        ],
      }),
    );
    expect(generatedSetFromEnvelope(envelope)?.cards).toHaveLength(1);
  });

  it("returns null for a non-flashcard_set root", () => {
    const envelope = normalizeJsonRegion(
      JSON.stringify({ __kind: "quiz_set", title: "Nope", questions: [] }),
      { schemas: kindRegistry.snapshotSchemas() },
    );
    expect(generatedSetFromEnvelope(envelope)).toBeNull();
  });

  it("returns null when the region did not complete cleanly", () => {
    const envelope = envelopeFor('{"title": "Cut off", "cards": [');
    expect(envelope.root.status).toBe("error");
    expect(generatedSetFromEnvelope(envelope)).toBeNull();
  });
});
