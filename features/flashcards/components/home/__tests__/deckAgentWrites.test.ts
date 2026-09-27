// The Flashcards home's agent write targets refuse a bad list WHOLE, before
// the approval card, naming every problem — and accept a good one exactly.

import {
  parseCreateDecksValue,
  parseDeleteDecksValue,
  parseUpdateDecksValue,
  type CurrentDeck,
} from "../deckAgentWrites";

const DECKS: CurrentDeck[] = [
  { id: "d1", name: "Cell Biology", archived: false },
  { id: "d2", name: "Organic Chemistry", archived: false },
  { id: "d3", name: "Old Spanish Verbs", archived: true },
];

describe("create_decks", () => {
  it("accepts a list and normalises fields", () => {
    const out = parseCreateDecksValue(
      [
        { name: " Photosynthesis ", topic: "Biology", difficulty: "Medium" },
        { name: "Cardiac cycle", description: "" },
      ],
      DECKS,
    );
    expect(out).toEqual([
      { name: "Photosynthesis", topic: "Biology", difficulty: "medium" },
      { name: "Cardiac cycle", description: null },
    ]);
  });

  it("names every problem at once and refuses the whole list", () => {
    let message = "";
    try {
      parseCreateDecksValue(
        [
          { name: "cell biology" },
          { topic: "no name" },
          { name: "X", difficulty: "brutal", colour: "red" },
          { name: "X" },
        ],
        DECKS,
      );
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/create_decks\[1\].*name is required/);
    expect(message).toMatch(/difficulty must be one of easy, medium, hard/);
    expect(message).toMatch(/does not accept colour/);
    expect(message).toMatch(/already has a deck named "cell biology"/);
    expect(message).toMatch(/more than once/);
    expect(message).toMatch(/Nothing was changed\.$/);
  });

  it("an archived deck's name is free to reuse", () => {
    expect(parseCreateDecksValue([{ name: "Old Spanish Verbs" }], DECKS)).toHaveLength(1);
  });

  it("refuses a non-list", () => {
    expect(() => parseCreateDecksValue("Photosynthesis", DECKS)).toThrow(/ARRAY/);
  });
});

describe("update_decks", () => {
  it("plans only the sent fields, plus archive/restore", () => {
    const plans = parseUpdateDecksValue(
      [
        { id: "d1", lesson: "Mitosis" },
        { id: "d2", archived: true },
        { id: "d3", archived: false, name: "Spanish Verbs" },
      ],
      DECKS,
    );
    expect(plans.map((p) => [p.id, p.patch, p.archived])).toEqual([
      ["d1", { lesson: "Mitosis" }, undefined],
      ["d2", {}, true],
      ["d3", { name: "Spanish Verbs" }, false],
    ]);
  });

  it("refuses unknown ids, empty changes, renames onto a taken name, and edits to archived decks", () => {
    let message = "";
    try {
      parseUpdateDecksValue(
        [
          { id: "nope", name: "A" },
          { id: "d1" },
          { id: "d2", name: "Cell Biology" },
          { id: "d3", topic: "Spanish" },
        ],
        DECKS,
      );
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/"nope" is not one of the person's own decks/);
    expect(message).toMatch(/update_decks\[1\].*changes nothing/);
    expect(message).toMatch(/already named "Cell Biology"/);
    expect(message).toMatch(/edits an archived deck/);
  });
});

describe("delete_decks", () => {
  it("accepts ids or { id } objects", () => {
    expect(parseDeleteDecksValue(["d1", { id: "d2" }], DECKS).map((d) => d.id)).toEqual([
      "d1",
      "d2",
    ]);
  });

  it("refuses an already-archived deck and repeats", () => {
    expect(() => parseDeleteDecksValue(["d3"], DECKS)).toThrow(/already archived/);
    expect(() => parseDeleteDecksValue(["d1", "d1"], DECKS)).toThrow(/more than once/);
  });
});
