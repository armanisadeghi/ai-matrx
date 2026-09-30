/**
 * A deck made from chat flashcards is named after its SUBJECT, never after the
 * platform's placeholder.
 *
 * The real case (conversation 10d796b4…, 2026-09-30): a learner asked a
 * flashcard agent for the polyatomic ions in their chemistry notes. The agent
 * wrote the `<flashcards>` text format, which had no title slot, so the
 * platform filled in "Flashcards" and the saved deck was named "Flashcards" —
 * as was every other deck made that way.
 */

import {
  GENERIC_FLASHCARD_TITLE,
  deriveFlashcardDeckName,
  isGenericFlashcardTitle,
  subjectFromRequest,
} from "./deckName";
import { parseFlashcards } from "@/components/mardown-display/blocks/flashcards/flashcard-parser";
import { flashcardsLegacyTextToKindValue } from "@/features/content-ir/surfaces/flashcards-legacy-text";

const POLYATOMIC_REQUEST =
  "Make flashcards for all of the polyatomic ions covered in these notes, including all of the ones that are specifically mentioned.";

const POLYATOMIC_CARDS = [
  { front: "Polyatomic Ion" },
  { front: "Oxoanion" },
  { front: 'Naming Rule: "-ate" vs. "-ite" Suffixes' },
  { front: "Ammonium" },
  { front: "Nitrate" },
];

describe("isGenericFlashcardTitle", () => {
  it.each(["Flashcards", "flashcards ", "Flashcard Set", "Flashcards 2", "", "Untitled"])(
    "treats the placeholder %p as naming nothing",
    (title) => {
      expect(isGenericFlashcardTitle(title)).toBe(true);
    },
  );

  it.each(["Polyatomic Ions", "Spanish Flashcards", "AP Biology Unit 3", "Chapter 12"])(
    "keeps the real name %p",
    (title) => {
      expect(isGenericFlashcardTitle(title)).toBe(false);
    },
  );
});

describe("subjectFromRequest", () => {
  it("names the subject of the real polyatomic-ions request", () => {
    expect(subjectFromRequest(POLYATOMIC_REQUEST)).toBe("Polyatomic Ions");
  });

  it.each([
    ["Create flashcards about the French Revolution for my exam", "French Revolution"],
    ["can you make me 20 flashcards on photosynthesis?", "Photosynthesis"],
    ["Make me some cell biology flashcards", "Cell Biology"],
    ["Flashcards for DNA replication and repair", "DNA Replication and Repair"],
    ["I need flashcards to memorize the bones of the hand", "Bones of the Hand"],
    [
      "Make flashcards for all of the polyatomic ions a first-year chemistry student must know, including nitrate, sulfate and ammonium.",
      "Polyatomic Ions",
    ],
    ["flashcards on how to write a resume", "How to Write a Resume"],
  ])("%p → %p", (request, expected) => {
    expect(subjectFromRequest(request)).toBe(expected);
  });

  it.each([
    "Make flashcards from these notes",
    "make flashcards for this document please",
    "Make me flashcards",
    "make me more flashcards",
    "Thanks, that helps",
    "",
  ])("finds no subject in %p", (request) => {
    expect(subjectFromRequest(request)).toBeNull();
  });
});

describe("deriveFlashcardDeckName", () => {
  it("names the placeholder-titled polyatomic deck after what was asked for", () => {
    expect(
      deriveFlashcardDeckName({
        title: GENERIC_FLASHCARD_TITLE,
        cards: POLYATOMIC_CARDS,
        request: POLYATOMIC_REQUEST,
      }),
    ).toEqual({ name: "Polyatomic Ions", source: "request" });
  });

  it("never rewrites a title the agent or the person chose", () => {
    expect(
      deriveFlashcardDeckName({
        title: "Ions I keep forgetting",
        cards: POLYATOMIC_CARDS,
        request: POLYATOMIC_REQUEST,
      }),
    ).toEqual({ name: "Ions I keep forgetting", source: "title" });
  });

  it("uses the topic the cards share before guessing from the request", () => {
    expect(
      deriveFlashcardDeckName({
        title: "Flashcards",
        cards: [
          { front: "Nitrate", topic: "Polyatomic ions" },
          { front: "Sulfate", topic: "Polyatomic ions" },
        ],
        request: "Make flashcards from these notes",
      }),
    ).toEqual({ name: "Polyatomic ions", source: "topic" });
  });

  it("falls back to the cards' own terms when the request names no subject", () => {
    expect(
      deriveFlashcardDeckName({
        title: "Flashcards",
        cards: [
          { front: "Nitrate" },
          { front: "Sulfate" },
          { front: "Ammonium" },
          { front: "Hydroxide" },
        ],
        request: "Make flashcards from these notes",
      }),
    ).toEqual({ name: "Nitrate, Sulfate, Ammonium and more", source: "cards" });
  });

  it("says so when nothing better exists rather than inventing a name", () => {
    expect(
      deriveFlashcardDeckName({
        title: "Flashcards",
        cards: [{ front: "What is the net charge of a sulfate ion, and why?" }],
        request: null,
      }),
    ).toEqual({ name: "Flashcards", source: "placeholder" });
  });
});

describe("the <flashcards> text format carries its own title", () => {
  const titled = [
    "<flashcards>",
    "Title: Polyatomic Ions",
    "---",
    "Front: Nitrate",
    "Back: NO3-",
    "---",
    "Front: Title: what a card front may still say",
    "Back: Anything",
    "---",
    "</flashcards>",
  ].join("\n");

  it("parses the Title line and keeps it out of the cards", () => {
    const parsed = parseFlashcards(titled);
    expect(parsed.title).toBe("Polyatomic Ions");
    expect(parsed.flashcards.map((card) => card.front)).toEqual([
      "Nitrate",
      "Title: what a card front may still say",
    ]);
  });

  it("puts that title on the flashcard_set value instead of the placeholder", () => {
    expect(flashcardsLegacyTextToKindValue(titled)?.title).toBe("Polyatomic Ions");
  });

  it("still yields a schema-valid placeholder title for untitled text", () => {
    const untitled = "<flashcards>\nFront: Nitrate\nBack: NO3-\n---\n</flashcards>";
    expect(parseFlashcards(untitled).title).toBeNull();
    expect(flashcardsLegacyTextToKindValue(untitled)?.title).toBe(
      GENERIC_FLASHCARD_TITLE,
    );
  });
});
