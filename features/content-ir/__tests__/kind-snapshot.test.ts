import {
  buildCompliantKindSnapshot,
  mergeResidueIntoValue,
} from "../core/kind-snapshot";
import { FLASHCARD_SCHEMAS, requireSchema } from "./fixtures/flashcards-fixture";

const flashcard = requireSchema(FLASHCARD_SCHEMAS, "flashcard");

describe("buildCompliantKindSnapshot residue channel", () => {
  it("stamps __kind and fills missing required fields with typed placeholders", () => {
    const { value, residue } = buildCompliantKindSnapshot(flashcard, {
      front: "Q?",
    });

    expect(value).toEqual({
      __kind: "flashcard",
      front: "Q?",
      back: null, // required + nullable → null placeholder
    });
    expect(residue).toEqual({
      extra: null,
      optionalMissing: ["card_kind", "difficulty", "topic", "tags"],
      notices: null,
    });
  });

  it("routes unknown keys to residue.extra — NEVER into value", () => {
    const { value, residue } = buildCompliantKindSnapshot(flashcard, {
      front: "Q?",
      back: "A",
      card_kind: "basic",
      difficulty: "easy",
      topic: "misc",
      tags: ["bio"],
      audio_url: "https://example.com/a.mp3",
      sources: ["book"],
    });

    expect(value).toEqual({
      __kind: "flashcard",
      front: "Q?",
      back: "A",
      card_kind: "basic",
      difficulty: "easy",
      topic: "misc",
      tags: ["bio"],
    });
    expect(residue?.extra).toEqual({
      audio_url: "https://example.com/a.mp3",
      sources: ["book"],
    });
    expect(residue?.optionalMissing).toBeNull();
  });

  it("returns residue: null when nothing is unknown or missing", () => {
    const { residue } = buildCompliantKindSnapshot(flashcard, {
      front: "Q?",
      back: "A",
      card_kind: "basic",
      difficulty: "easy",
      topic: "misc",
      tags: ["bio"],
    });
    expect(residue).toBeNull();
  });

  it("round-trips losslessly: value + residue.extra === source fields", () => {
    const source = {
      front: "Q?",
      back: "A",
      topic: "misc",
      audio_url: "https://example.com/a.mp3",
      nested_extra: { a: 1, b: [true, null] },
    };

    const { value, residue } = buildCompliantKindSnapshot(flashcard, source);
    const merged = mergeResidueIntoValue(value, residue);

    // Every source key survives with its exact value.
    for (const [key, expected] of Object.entries(source)) {
      expect(merged[key]).toEqual(expected);
    }
    expect(merged.__kind).toBe("flashcard");
  });

  it("mergeResidueIntoValue is identity when residue is null", () => {
    const value = { __kind: "flashcard", front: "Q?" };
    expect(mergeResidueIntoValue(value, null)).toBe(value);
  });
});
