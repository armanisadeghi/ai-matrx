// IC-11 round-trip law: whatever export emits, import must accept losslessly
// for the JSON format — deck-level fields AND card-level fields (trust,
// scheduling, media). Plus the RFC-4180 CSV guarantee: our own CSV export
// re-imports exactly.

import {
  buildDeckExport,
  parseDeckJson,
  toPortableDeck,
} from "../export/deckFormats";
import {
  buildSetCsv,
  parseCsvRecords,
} from "@/features/flashcards/utils/importExportCsv";

const SET = {
  name: "Cell Biology",
  description: "Organelles and their functions",
  topic: "Biology",
  difficulty: "intermediate",
};

const CARDS = [
  {
    id: "c1",
    front: 'The "powerhouse", aka mitochondria',
    back: "Makes ATP,\nacross two lines",
    card_kind: "basic",
    difficulty: "easy",
    topic: "Organelles",
    metadata: { trust: { confidence: "grounded" } },
  },
  {
    id: "c2",
    front: "{{c1::Photosynthesis}} converts light",
    back: "",
    card_kind: "cloze",
    difficulty: null,
    topic: null,
    metadata: null,
  },
];

describe("JSON deck round-trip (IC-11)", () => {
  it("preserves deck-level and card-level fields, scheduling, and media", () => {
    const scheduling = {
      due_at: "2026-08-30T00:00:00.000Z",
      stability: 30,
      difficulty: 5,
      lapses: 3,
      reps: 42,
      last_review: "2026-08-01T00:00:00.000Z",
    };
    const media = [{ file_id: "f-1", kind: "image" as const, source_name: "cell.png" }];
    const json = buildDeckExport(SET, CARDS, "json", "2026-08-17T00:00:00Z", {
      schedulingByCardId: new Map([["c1", scheduling]]),
      mediaByCardId: new Map([["c1", media]]),
    });
    const parsed = parseDeckJson(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe(SET.name);
    expect(parsed!.description).toBe(SET.description);
    expect(parsed!.topic).toBe(SET.topic);
    expect(parsed!.difficulty).toBe(SET.difficulty);
    expect(parsed!.cards).toHaveLength(2);
    const [c1, c2] = parsed!.cards;
    expect(c1.front).toBe(CARDS[0].front);
    expect(c1.back).toBe(CARDS[0].back.trim());
    expect(c1.trust).toEqual({ confidence: "grounded" });
    expect(c1.scheduling).toEqual(scheduling);
    expect(c1.media).toEqual(media);
    expect(c2.card_kind).toBe("cloze");
    expect(c2.scheduling).toBeNull();
  });

  it("reads the legacy nested set:{} shape (pre-consolidation exports)", () => {
    const legacy = JSON.stringify({
      format: "matrx-flashcards",
      version: 1,
      set: { id: "x", name: "Legacy Deck", description: "old shape" },
      cards: [{ front: "Q", back: "A" }],
    });
    const parsed = parseDeckJson(legacy);
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe("Legacy Deck");
    expect(parsed!.description).toBe("old shape");
    expect(parsed!.cards).toHaveLength(1);
  });

  it("toPortableDeck stamps version 2 with the matrx.flashcards format", () => {
    const deck = toPortableDeck(SET, CARDS, null);
    expect(deck.__format).toBe("matrx.flashcards");
    expect(deck.version).toBe(2);
  });
});

describe("CSV round-trip (RFC-4180)", () => {
  it("re-imports our own CSV export exactly, header skipped", () => {
    const csv = buildSetCsv(CARDS.map((c) => ({ front: c.front, back: c.back })));
    const { rows, skipped } = parseCsvRecords(csv);
    // Card 2 has an empty back — honestly skipped, not guessed.
    expect(rows).toHaveLength(1);
    expect(rows[0].front).toBe(CARDS[0].front);
    expect(rows[0].back).toBe(CARDS[0].back);
    expect(skipped).toHaveLength(1);
  });

  it("handles quoted commas, escaped quotes, and embedded newlines", () => {
    const csv = 'front,back\r\n"a, b","he said ""hi""\nsecond line"\r\nplain,also plain';
    const { rows, skipped } = parseCsvRecords(csv);
    expect(skipped).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0].front).toBe("a, b");
    expect(rows[0].back).toBe('he said "hi"\nsecond line');
    expect(rows[1].front).toBe("plain");
  });
});
