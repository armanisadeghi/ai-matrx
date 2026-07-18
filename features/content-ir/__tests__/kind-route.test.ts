/**
 * Phase 4: kind routing. A block with a resolved, registered kind in its
 * envelope becomes the kind's legacy component type with envelope-derived
 * serverData; everything else passes through by reference (strangler seam).
 */

import { applyIrKindRoute } from "../react/kind-route";
import { normalizeJsonRegion } from "../core/normalize";
import { kindRegistry } from "../registry/kind-registry";
import { IR_ENVELOPE_KEY } from "../core/ir-types";
import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";
import { flashcardsServerDataFromEnvelope } from "../kinds/flashcard-set";

const FLASHCARDS = JSON.stringify({
  __kind: "flashcard_set",
  title: "Route",
  cards: [
    { __kind: "flashcard", front: "Q1", back: "A1", hint: "extra kept" },
    { __kind: "flashcard", front: "Q2", back: "A2" },
  ],
});

function envelopeFor(source: string) {
  return normalizeJsonRegion(source, {
    schemas: kindRegistry.snapshotSchemas(),
  });
}

describe("applyIrKindRoute", () => {
  it("routes a code-typed flashcard_set block to flashcards with serverData", () => {
    const envelope = envelopeFor(FLASHCARDS);
    const block = {
      type: "code",
      content: FLASHCARDS,
      metadata: { [IR_ENVELOPE_KEY]: envelope },
    };

    const routed = applyIrKindRoute(block);
    expect(routed.type).toBe("flashcards");

    const serverData = (
      routed as { serverData?: FlashcardsBlockData & { title?: string } }
    ).serverData;
    expect(serverData?.isComplete).toBe(true);
    expect(serverData?.title).toBe("Route"); // set title passes through
    expect(serverData?.cards).toHaveLength(2);
    expect(serverData?.cards[0]).toMatchObject({
      front: "Q1",
      back: "A1",
      hint: "extra kept", // schema-unknown key survives via residue merge
    });
  });

  it("passes through blocks without an envelope by reference", () => {
    const block = { type: "code", content: "{}", metadata: {} };
    expect(applyIrKindRoute(block)).toBe(block);
  });

  it("routes a DECLARED-but-unregistered kind to the generic viewer (never raw JSON)", () => {
    // The kind was identified from `__kind` but no schema exists — a
    // known-but-unrenderable shape. The envelope preserves the kind through
    // the raw fallback, and the route sends it to the generic structured
    // viewer with the unverified affordance (streaming db-kinds mandate).
    const envelope = envelopeFor(
      JSON.stringify({ __kind: "not_registered_anywhere", a: 1 }),
    );
    expect(envelope.root.kind).toBe("not_registered_anywhere");
    expect(envelope.root.kindState).toBe("raw");
    const block = {
      type: "code",
      content: "x",
      metadata: { [IR_ENVELOPE_KEY]: envelope },
    };
    const routed = applyIrKindRoute(block);
    expect(routed.type).toBe("generic_structured");
    expect(
      (routed.metadata as Record<string, unknown>).__ir_route,
    ).toMatchObject({ by: "generic", unverified: true });
  });

  it("passes through genuinely kind-less raw JSON by reference (no __kind → legacy rendering)", () => {
    const envelope = envelopeFor(JSON.stringify({ a: 1, b: [2, 3] }));
    expect(envelope.root.kind).toBe("");
    const block = {
      type: "code",
      content: "x",
      metadata: { [IR_ENVELOPE_KEY]: envelope },
    };
    expect(applyIrKindRoute(block)).toBe(block);
  });

  it("never overrides explicit server-provided data", () => {
    const envelope = envelopeFor(FLASHCARDS);
    const block = {
      type: "flashcards",
      content: FLASHCARDS,
      serverData: { cards: [{ front: "server wins", back: "yes" }] },
      metadata: { [IR_ENVELOPE_KEY]: envelope },
    };
    const routed = applyIrKindRoute(block);
    expect(routed).toBe(block);
  });

  it("card mapping is reference-stable across calls (memoized on tree identity)", () => {
    const envelope = envelopeFor(FLASHCARDS);
    const first = flashcardsServerDataFromEnvelope(envelope) as
      | FlashcardsBlockData
      | undefined;
    const second = flashcardsServerDataFromEnvelope(envelope) as
      | FlashcardsBlockData
      | undefined;
    expect(second?.cards[0]).toBe(first?.cards[0]);
    expect(second?.cards[1]).toBe(first?.cards[1]);
  });

  it("streaming envelopes map an unfinished back to null (per-card loader)", () => {
    // Build a live session mid-stream via the normalizer's parser pieces:
    // easiest faithful setup is a partial parse through ParseSession.
    // (Covered more fully in accumulator tests; here we just assert the
    // mapping contract on a synthetic streaming envelope.)
    const envelope = envelopeFor(FLASHCARDS);
    const streaming = {
      ...envelope,
      root: {
        ...envelope.root,
        status: "streaming" as const,
        value: {
          ...envelope.root.value,
          cards: [{ __kind: "flashcard", front: "Q1", back: "" }],
        },
      },
      nodeIndex: {
        "cards.0": { kind: "flashcard", kindState: "resolved" as const, status: "streaming" as const },
      },
    };
    const serverData = flashcardsServerDataFromEnvelope(streaming) as
      | FlashcardsBlockData
      | undefined;
    expect(serverData?.isComplete).toBe(false);
    expect(serverData?.cards[0].back).toBeNull();
  });
});
