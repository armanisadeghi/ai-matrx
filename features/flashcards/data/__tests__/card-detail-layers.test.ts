/**
 * The READER that finally makes card enrichment visible. Every surface that
 * shows "what does this card already have" — the study card's "More on this
 * card" strip, set detail's layer badge, and the bulk planner's "does this card
 * need enriching" decision — goes through `selectCardDetailLayers`, so these
 * are the rules all three obey.
 */

import {
  DETAIL_LAYER_LABEL,
  cardHasDetailLayers,
  isDetailLayerKind,
  selectCardDetailLayers,
  type DetailLike,
} from "../cardDetailLayers";

const row = (over: Partial<DetailLike> & Pick<DetailLike, "kind" | "text">) =>
  ({ position: 0, deleted_at: null, metadata: {}, ...over }) as DetailLike;

describe("selectCardDetailLayers", () => {
  it("returns every learner-readable text layer, labelled", () => {
    const layers = selectCardDetailLayers([
      row({ id: "a", kind: "helper", text: "Think of it as a solar panel." }),
      row({ id: "b", kind: "example", text: "A spinach leaf bubbles." }),
    ]);
    expect(layers.map((l) => l.kind)).toEqual(["helper", "example"]);
    expect(layers[0].label).toBe(DETAIL_LAYER_LABEL.helper);
    expect(layers[1].text).toBe("A spinach leaf bubbles.");
  });

  it("orders by kind (simple → deep), then by position", () => {
    const layers = selectCardDetailLayers([
      row({ id: "1", kind: "detailed", text: "deep" }),
      row({ id: "2", kind: "mnemonic", text: "trick" }),
      row({ id: "3", kind: "simplified", text: "simple" }),
      row({ id: "4", kind: "example", text: "second example", position: 2 }),
      row({ id: "5", kind: "example", text: "first example", position: 1 }),
    ]);
    expect(layers.map((l) => l.id)).toEqual(["3", "5", "4", "1", "2"]);
  });

  it("ignores audio, image and unknown kinds — those have their own renderers", () => {
    const layers = selectCardDetailLayers([
      row({ kind: "spoken_front", text: "narration" }),
      row({ kind: "front_image", text: "alt text" }),
      row({ kind: "something_new", text: "unknown" }),
      row({ kind: "helper", text: "the only layer" }),
    ]);
    expect(layers).toHaveLength(1);
    expect(layers[0].text).toBe("the only layer");
  });

  it("drops soft-deleted rows and blank text", () => {
    const layers = selectCardDetailLayers([
      row({ kind: "helper", text: "gone", deleted_at: "2026-08-01T00:00:00Z" }),
      row({ kind: "example", text: "   " }),
      row({ kind: "hint", text: "kept" }),
    ]);
    expect(layers.map((l) => l.text)).toEqual(["kept"]);
  });

  it("never double-renders a memory aid (MemoryAidButton owns those rows)", () => {
    const layers = selectCardDetailLayers([
      row({
        kind: "mnemonic",
        text: "ROY G BIV",
        metadata: { source: "memory_hint", technique: "acronym" },
      }),
      row({ kind: "mnemonic", text: "a hand-written trick" }),
    ]);
    expect(layers).toHaveLength(1);
    expect(layers[0].text).toBe("a hand-written trick");
  });

  it("trims the rendered text and survives null/undefined input", () => {
    expect(selectCardDetailLayers(null)).toEqual([]);
    expect(selectCardDetailLayers(undefined)).toEqual([]);
    expect(
      selectCardDetailLayers([row({ kind: "helper", text: "  padded  " })])[0]
        .text,
    ).toBe("padded");
  });
});

describe("cardHasDetailLayers — the bulk planner's skip decision", () => {
  it("is false for a card carrying only audio/image rows (it still needs enriching)", () => {
    expect(
      cardHasDetailLayers([
        row({ kind: "spoken_front", text: "narration" }),
        row({ kind: "back_image", text: "alt" }),
      ]),
    ).toBe(false);
  });

  it("is true as soon as one real text layer exists", () => {
    expect(cardHasDetailLayers([row({ kind: "simplified", text: "x" })])).toBe(
      true,
    );
  });

  it("is false for an empty card", () => {
    expect(cardHasDetailLayers([])).toBe(false);
  });
});

describe("isDetailLayerKind", () => {
  it("accepts exactly the six enrich_card kinds", () => {
    for (const kind of [
      "helper",
      "example",
      "detailed",
      "hint",
      "mnemonic",
      "simplified",
    ]) {
      expect(isDetailLayerKind(kind)).toBe(true);
    }
    expect(isDetailLayerKind("spoken_front")).toBe(false);
  });
});
