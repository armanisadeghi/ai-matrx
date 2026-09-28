import { cleanupOfferVariables } from "../../cleanupOffer";

const FACTS = {
  entries: [
    { text: "first bit", timestamp: Date.UTC(2026, 8, 28, 10, 0, 0) },
    { text: "second bit", timestamp: Date.UTC(2026, 8, 28, 10, 5, 0) },
  ],
  wasEdited: true,
  transcript: "first bit\n\nsecond bit edited",
  context: "[Glossary]\nERP = enterprise resource planning",
  previousCleanedText: "First bit. Second bit.",
};

describe("cleanupOfferVariables", () => {
  it("plain cleaner: entry facts only", () => {
    expect(cleanupOfferVariables({ id: "clean_without_context" }, FACTS)).toEqual({
      entry_count: 2,
      was_edited: true,
      first_entry_at: "2026-09-28T10:00:00.000Z",
      last_entry_at: "2026-09-28T10:05:00.000Z",
    });
  });

  it.each(["clean_with_context", "clean_with_context_variable"])(
    "%s: context-cleaner facts, native types",
    (id) => {
      expect(cleanupOfferVariables({ id }, FACTS)).toEqual({
        raw_word_count: 5,
        transcript_segments: ["first bit", "second bit"],
        context_items: "[Glossary]\nERP = enterprise resource planning",
        previous_cleaned_text: "First bit. Second bit.",
      });
    },
  );

  it("omits what it does not hold and never emits a by-name key", () => {
    const v = cleanupOfferVariables(
      { id: "clean_with_context_variable" },
      { entries: [], wasEdited: false, transcript: "", context: " ", previousCleanedText: "" },
    );
    expect(v).toEqual({});
    const plain = cleanupOfferVariables(
      { id: "clean_without_context" },
      { entries: [], wasEdited: false, transcript: "x", context: "" },
    );
    expect(plain).toEqual({ entry_count: 0, was_edited: false });
    for (const k of ["transcript", "user_context", "transcribed_text", "context"]) {
      expect(k in plain).toBe(false);
    }
  });
});
