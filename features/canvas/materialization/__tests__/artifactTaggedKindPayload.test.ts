/**
 * A kind payload wrapped in an `<artifact>` tag whose id is NOT a canvas UUID
 * (the model's own slug) — the live shape from conversation fd5baf54…,
 * 2026-09-30:
 *
 *   <artifact type="flashcards" id="mitosis-phases-deck" version="1" title="Phases of Mitosis">
 *   {"__kind":"flashcard_set","cards":[…]}
 *   </artifact>
 *
 * WRITE half: it must plan STRUCTURED (object `content.data`, metadata.kind),
 * never as a JSON string with empty metadata.
 * READ half: a row already stored as a JSON STRING (the live row
 * 67954ee5…) must still render its cards through the same rehydration seam
 * ArtifactRender / ArtifactRefBlock use.
 */

import type { CxContentBlock } from "@ai-matrx/chat/public-chat/types/cx-tables";
import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";
import { planMaterialization } from "../planMaterialization";
import { storedKindValue } from "@/features/canvas/artifact-types/storedKindValue";
import { kindServerDataFromStoredValue } from "@/features/content-ir/react/kind-route";
import { deriveFlashcardsSet } from "@/components/mardown-display/blocks/flashcards/flashcards-set-derive";

const PAYLOAD = JSON.stringify({
  __kind: "flashcard_set",
  cards: [
    {
      __kind: "flashcard",
      front: "What are the four primary phases of mitosis in order?",
      back: "Prophase, metaphase, anaphase, and telophase (PMAT).",
      card_kind: "basic",
      difficulty: "easy",
    },
    {
      __kind: "flashcard",
      front: "During which phase do sister chromatids align on the metaphase plate?",
      back: "Metaphase.",
      card_kind: "concept",
      difficulty: "medium",
    },
  ],
});

const TAGGED = `<artifact type="flashcards" id="mitosis-phases-deck" version="1" title="Phases of Mitosis">\n${PAYLOAD}\n</artifact>`;

describe("<artifact>-tagged kind payload with a non-UUID id", () => {
  it("plans as a STRUCTURED artifact carrying metadata.kind", () => {
    const plan = planMaterialization([
      { type: "text", text: TAGGED } as CxContentBlock,
    ]);
    expect(plan.artifacts).toHaveLength(1);
    const [a] = plan.artifacts;
    expect(a?.canvasType).toBe("flashcards");
    expect(a?.metadata).toEqual({ kind: "flashcard_set" });
    expect(a?.structured?.__kind).toBe("flashcard_set");
    expect(Array.isArray(a?.structured?.cards)).toBe(true);
    expect(a?.title).toBe("Phases of Mitosis");
  });

  it("a row already stored as a JSON STRING still renders every card", () => {
    const sd = kindServerDataFromStoredValue(storedKindValue(PAYLOAD)) as
      | FlashcardsBlockData
      | null;
    const derived = deriveFlashcardsSet({ serverData: sd ?? undefined });
    expect(derived.flashcards).toHaveLength(2);
    expect(derived.flashcards[0]).toMatchObject({
      front: "What are the four primary phases of mitosis in order?",
    });
  });

  it("leaves non-kind strings untouched", () => {
    expect(storedKindValue("Front: Q\nBack: A")).toBe("Front: Q\nBack: A");
    expect(storedKindValue('{"title":"no kind"}')).toBe('{"title":"no kind"}');
  });
});
