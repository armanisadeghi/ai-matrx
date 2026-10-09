/**
 * Living-kit W2 for decks: steering folds into `focus` the one way, every card a
 * run makes carries its batch id, a one-section run stamps topic + section id,
 * and "Undo last add" finds exactly the batch's cards.
 */
import { BATCH_KEY, OUTLINE_SECTION_KEY } from "@/features/education/kits/outline/types";
import { cardsFocusText, stampRunCards } from "../generateDeckFromSources";
import { cardsInBatch } from "../undoCardBatch";
import { cardRunRequest, restoreCardRunRequest } from "../cardRunRequest";
import type { SourceSet } from "@ai-matrx/agents/sources";
import { createSourceRef } from "@ai-matrx/agents/sources";

const card = (front: string) => ({ front, back: "b" });
const section = { id: "s-1", title: "Isotopes", facts: [{ statement: "Same protons", chunkIds: [] }] };

test("focus carries the grade, the person's words, the card types and what exists", () => {
  const text = cardsFocusText(
    "Grade 9",
    undefined,
    { instruction: "exam style", cardKinds: ["cloze"] },
    [card("What is osmosis?")],
  );
  expect(text).toContain("Write for this level: Grade 9.");
  expect(text).toContain("exam style");
  expect(text).toContain('card_kind "cloze"');
  expect(text).toContain("- What is osmosis?");
});

test("no steer and no cards folds to nothing", () => {
  expect(cardsFocusText(undefined, undefined, undefined, [])).toBe("");
});

test("every card gets the batch id; a single section stamps topic and section id", () => {
  const out = stampRunCards([card("a"), card("b")], { batchId: "B1", sections: [section] });
  for (const c of out) {
    expect(c.metadata?.[BATCH_KEY]).toBe("B1");
    expect(c.metadata?.[OUTLINE_SECTION_KEY]).toBe("s-1");
    expect(c.topic).toBe("Isotopes");
  }
});

test("several sections stamp the batch only, not a guessed section", () => {
  const out = stampRunCards([card("a")], { batchId: "B1", sections: [section, { ...section, id: "s-2" }] });
  expect(out[0]!.metadata?.[BATCH_KEY]).toBe("B1");
  expect(out[0]!.metadata?.[OUTLINE_SECTION_KEY]).toBeUndefined();
  expect(out[0]!.topic).toBeUndefined();
});

test("no batch and no section leaves the cards untouched", () => {
  const cards = [card("a")];
  expect(stampRunCards(cards, {})).toBe(cards);
});

test("Undo finds exactly the batch's cards", () => {
  const deck = [
    { id: "1", metadata: { [BATCH_KEY]: "B1" } },
    { id: "2", metadata: { [BATCH_KEY]: "B2" } },
    { id: "3", metadata: null },
    { id: "4", metadata: {} },
  ];
  expect(cardsInBatch(deck, "B1").map((c) => c.id)).toEqual(["1"]);
  expect(cardsInBatch(deck, "")).toEqual([]);
});

test("a stopped run is repeated with the same types and focus", () => {
  const set = { version: 1, sources: [createSourceRef("file", "f-1")] } as unknown as SourceSet;
  const stored = JSON.parse(
    JSON.stringify(
      cardRunRequest(5, set, { "file:f-1": { label: "Ch 4.pdf", kind: "files" } }, "", {
        cardKinds: ["cloze", "formula"],
        instruction: "  the Krebs cycle ",
      }),
    ),
  ) as Record<string, unknown>;
  const back = restoreCardRunRequest(stored);
  expect(back?.cardKinds).toEqual(["cloze", "formula"]);
  expect(back?.instruction).toBe("the Krebs cycle");
});
