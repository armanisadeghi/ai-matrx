import {
  parseMatchingCardUpdate,
  parseNewMatchingCard,
} from "./flashcardEditorAgentWrites";

const CARDS = [
  { id: "matching-1", version: 4, card_kind: "matching" },
  { id: "basic-1", version: 2, card_kind: "basic" },
];

describe("flashcard editor matching agent writes", () => {
  it("accepts a versioned matching-card update", () => {
    expect(
      parseMatchingCardUpdate(
        {
          card_id: "matching-1",
          expected_version: 4,
          prompt: "Match the organs",
          pairs: [{ left: "Heart", right: "Pumps blood" }],
        },
        CARDS,
      ),
    ).toEqual({
      id: "matching-1",
      expectedVersion: 4,
      prompt: "Match the organs",
      pairs: [{ left: "Heart", right: "Pumps blood" }],
    });
  });

  it("refuses stale, non-matching, and malformed matching updates", () => {
    expect(() =>
      parseMatchingCardUpdate(
        { card_id: "matching-1", expected_version: 3, pairs: [] },
        CARDS,
      ),
    ).toThrow(/changed/);
    expect(() =>
      parseMatchingCardUpdate(
        { card_id: "basic-1", expected_version: 2, pairs: [] },
        CARDS,
      ),
    ).toThrow(/only updates matching/);
    expect(() =>
      parseMatchingCardUpdate(
        {
          card_id: "matching-1",
          expected_version: 4,
          pairs: [{ left: "", right: "Definition" }],
        },
        CARDS,
      ),
    ).toThrow(/non-empty/);
  });

  it("requires structured pairs when creating a matching card", () => {
    expect(
      parseNewMatchingCard(
        {
          front: "Match terms",
          pairs: [{ left: "Atom", right: "Smallest unit" }],
        },
        "add_cards: cards[0]",
      ),
    ).toEqual({
      front: "Match terms",
      pairs: [{ left: "Atom", right: "Smallest unit" }],
    });
    expect(() =>
      parseNewMatchingCard(
        { front: "Match terms", pairs: [] },
        "add_cards: cards[0]",
      ),
    ).toThrow(/non-empty array/);
  });
});
