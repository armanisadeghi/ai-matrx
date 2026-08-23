/**
 * The enrich / expand readers — the `card_enrichment` and `card_expansion`
 * kinds the rebuilt `flashcards.enrich_card` / `flashcards.expand_card`
 * agents emit (fixtures are the kinds' canonical samples, `__kind` at every
 * level). The readers narrow to persist-ready rows and ignore `__kind`.
 */

jest.mock(
  "@/features/agents/redux/execution-system/thunks/run-headless-agent-json",
  () => ({ runHeadlessAgentJson: jest.fn(), livePosture: () => ({}) }),
);

import {
  coerceDetails,
  coerceSubCards,
  readPendingEnhancement,
} from "../enhanceCard";

const ENRICHMENT = {
  __kind: "card_enrichment",
  details: [
    { __kind: "card_detail", kind: "helper", text: "Think of the thylakoid as the solar panel." },
    { __kind: "card_detail", kind: "example", text: "A spinach leaf in water releases oxygen bubbles." },
    { __kind: "card_detail", kind: "mnemonic", text: "Light reactions Love the thyLakoid." },
    { __kind: "card_detail", kind: "hint", text: "Which stage needs light directly?" },
    { __kind: "card_detail", kind: "not-a-kind", text: "Falls back to helper." },
    { __kind: "card_detail", kind: "example", text: "   " },
  ],
};

const EXPANSION = {
  __kind: "card_expansion",
  sub_cards: [
    { __kind: "sub_card", front: "Where do the light-dependent reactions take place?", back: "In the thylakoid membranes.", relation: "expands_into" },
    { __kind: "sub_card", front: "What two energy carriers do they produce?", back: "ATP and NADPH.", relation: "expands_into" },
    { __kind: "sub_card", front: "", back: "", relation: "expands_into" },
  ],
};

describe("coerceDetails (card_enrichment)", () => {
  it("reads the live kind payload into persist-ready layers", () => {
    expect(coerceDetails(ENRICHMENT)).toEqual([
      { kind: "helper", text: "Think of the thylakoid as the solar panel." },
      { kind: "example", text: "A spinach leaf in water releases oxygen bubbles." },
      { kind: "mnemonic", text: "Light reactions Love the thyLakoid." },
      { kind: "hint", text: "Which stage needs light directly?" },
      { kind: "helper", text: "Falls back to helper." },
    ]);
  });

  it("never throws on junk", () => {
    expect(coerceDetails(null)).toEqual([]);
    expect(coerceDetails({ details: "nope" })).toEqual([]);
    expect(coerceDetails([])).toEqual([]);
  });
});

describe("coerceSubCards (card_expansion)", () => {
  it("reads the live kind payload (sub_cards) and the camelCase drift key", () => {
    expect(coerceSubCards(EXPANSION)).toEqual([
      { front: "Where do the light-dependent reactions take place?", back: "In the thylakoid membranes." },
      { front: "What two energy carriers do they produce?", back: "ATP and NADPH." },
    ]);
    expect(coerceSubCards({ subCards: EXPANSION.sub_cards })).toHaveLength(2);
    expect(coerceSubCards(undefined)).toEqual([]);
  });
});

describe("readPendingEnhancement", () => {
  it("round-trips a stored proposal through the same readers", () => {
    const pending = readPendingEnhancement({
      pending_enhancement: {
        mode: "deepen",
        depth: "exam",
        details: [],
        subCards: EXPANSION.sub_cards,
        generated_at: "2026-08-22T00:00:00.000Z",
      },
    });
    expect(pending?.mode).toBe("deepen");
    expect(pending?.depth).toBe("exam");
    expect(pending?.subCards).toHaveLength(2);
    expect(readPendingEnhancement({ pending_enhancement: { mode: "enrich", details: [] } })).toBeNull();
  });
});
