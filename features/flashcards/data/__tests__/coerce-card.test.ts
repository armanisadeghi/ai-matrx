/**
 * THE ONE flashcard reader (`coerce-card.ts`) — every generation consumer
 * (topic, from-source, kit deck, top-up, envelope save) narrows agent cards
 * through it. Fixtures are the live `flashcard_set` kind's output (the
 * builder-made agents emit `__kind` at every level; readers must ignore it).
 */

import { coerceCard, coerceCards, rawCardsOf, setTitleOf } from "../coerce-card";

const LIVE_SET = {
  __kind: "flashcard_set",
  title: "Photosynthesis — Light and Dark Reactions",
  cards: [
    {
      __kind: "flashcard",
      front: "Where do the light-dependent reactions take place?",
      back: "In the thylakoid membranes of the chloroplast.",
      topic: "Photosynthesis",
      card_kind: "basic",
      difficulty: "medium",
      tags: ["chloroplast"],
      source: { processed_document_id: "doc_1c9e", chunk_id: "chunk_8f2a", page: 214 },
      trust: {
        __kind: "trust_envelope",
        confidence: "grounded",
        groundedIn: "Chapter 8, section 8.2",
        citations: [
          {
            __kind: "citation",
            sourceId: "chunk_8f2a",
            sourceKind: "chunk",
            locator: "p. 214",
            excerpt: "Water molecules are split (photolysis), releasing oxygen.",
            title: "Biology — Chapter 8",
          },
        ],
      },
    },
    { __kind: "flashcard", front: "  ", back: "" },
    { __kind: "flashcard", front: "The Calvin cycle runs in the ___.", back: "stroma", card_kind: "cloze" },
  ],
};

describe("coerceCard", () => {
  it("reads the live flashcard item (ignores __kind, keeps lineage + trust)", () => {
    const card = coerceCard(LIVE_SET.cards[0]);
    expect(card).toMatchObject({
      front: "Where do the light-dependent reactions take place?",
      back: "In the thylakoid membranes of the chloroplast.",
      topic: "Photosynthesis",
      card_kind: "basic",
      difficulty: "medium",
      source: { file_id: "", processed_document_id: "doc_1c9e", chunk_id: "chunk_8f2a", page: 214 },
    });
    expect(card?.trust?.confidence).toBe("grounded");
    expect(card?.trust?.citations[0]?.sourceId).toBe("chunk_8f2a");
    expect(card).not.toHaveProperty("__kind");
  });

  it("drops an entry with neither front nor back; floors missing fields", () => {
    expect(coerceCard(LIVE_SET.cards[1])).toBeNull();
    expect(coerceCard("not an object")).toBeNull();
    expect(coerceCard(LIVE_SET.cards[2])).toEqual({
      front: "The Calvin cycle runs in the ___.",
      back: "stroma",
      card_kind: "cloze",
      difficulty: null,
      topic: null,
      source: undefined,
      trust: undefined,
    });
  });

  it("points lineage at the anchor file when the caller knows it (kit deck / top-up)", () => {
    const withAnchor = coerceCard(LIVE_SET.cards[0], { anchorFileId: "file_9", docId: "ingest" });
    expect(withAnchor?.source).toEqual({
      file_id: "file_9",
      processed_document_id: "doc_1c9e",
      chunk_id: "chunk_8f2a",
      page: 214,
    });
    // No echoed source at all: the anchor still produces a lineage edge, the
    // doc id falls back to the caller's.
    const bare = coerceCard(LIVE_SET.cards[2], { anchorFileId: "file_9", docId: "ingest" });
    expect(bare?.source).toEqual({
      file_id: "file_9",
      processed_document_id: "ingest",
      chunk_id: undefined,
      page: undefined,
    });
  });
});

describe("coerceCards / rawCardsOf / setTitleOf", () => {
  it("reads the canonical set and the drift shapes identically", () => {
    expect(coerceCards(LIVE_SET)).toHaveLength(2);
    expect(rawCardsOf({ flashcards: LIVE_SET.cards })).toHaveLength(3);
    expect(rawCardsOf(LIVE_SET.cards)).toHaveLength(3);
    expect(rawCardsOf({ nothing: true })).toEqual([]);
    expect(rawCardsOf(null)).toEqual([]);
  });

  it("reads the set title only from the kind's title key", () => {
    expect(setTitleOf(LIVE_SET)).toBe("Photosynthesis — Light and Dark Reactions");
    expect(setTitleOf({ name: "x" })).toBe("");
    expect(setTitleOf(LIVE_SET.cards)).toBe("");
  });
});
