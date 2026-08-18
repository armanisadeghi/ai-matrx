/**
 * `coerceStudyNotes` must be IDEMPOTENT.
 *
 * The normal render path coerces TWICE: the kind bridge
 * (`studyNotesServerDataFromEnvelope`) hands `StudyNotesBlock` an already-
 * coerced document, and the block coerces whatever it is given because it also
 * accepts a raw persisted value. When the coercer read only the wire spelling
 * `key_points`, the second pass silently blanked every key point — while
 * `examples`, spelled the same in both shapes, survived. On screen that was
 * study notes with summaries and worked examples and none of the facts, with
 * no error anywhere. Caught in browser verification, 2026-08-18.
 */

import {
  coerceStudyNotes,
  studyNotesMarkdownFromValue,
} from "../kinds/study-notes";

const WIRE = {
  __kind: "study_notes",
  title: "Plate Tectonics",
  overview: "Plates drift over the asthenosphere.",
  sections: [
    {
      __kind: "study_notes_section",
      heading: "The three boundaries",
      summary: "Where two plates meet decides what gets built.",
      key_points: ["Divergent builds crust.", "Convergent destroys it."],
      examples: ["The Mid-Atlantic Ridge."],
    },
  ],
  glossary: [
    { __kind: "glossary_term", term: "Lithosphere", definition: "The rigid shell." },
  ],
};

describe("coerceStudyNotes", () => {
  it("reads the wire shape", () => {
    const notes = coerceStudyNotes(WIRE);
    expect(notes.title).toBe("Plate Tectonics");
    expect(notes.sections[0].keyPoints).toEqual([
      "Divergent builds crust.",
      "Convergent destroys it.",
    ]);
    expect(notes.sections[0].examples).toEqual(["The Mid-Atlantic Ridge."]);
    expect(notes.glossary).toHaveLength(1);
  });

  it("is idempotent — coercing its own output loses nothing", () => {
    const once = coerceStudyNotes(WIRE);
    const twice = coerceStudyNotes(once);
    expect(twice).toEqual(once);
  });

  it("keeps key points through a double coercion (the shipped defect)", () => {
    const twice = coerceStudyNotes(coerceStudyNotes(WIRE));
    expect(twice.sections[0].keyPoints).toHaveLength(2);
  });

  it("tolerates a partial mid-stream section", () => {
    const notes = coerceStudyNotes({
      title: "Photosynthesis",
      sections: [{ heading: "Stage one" }],
    });
    expect(notes.sections[0].heading).toBe("Stage one");
    expect(notes.sections[0].keyPoints).toEqual([]);
    expect(notes.overview).toBe("");
  });

  it("renders key points into the markdown facet", () => {
    const md = studyNotesMarkdownFromValue(WIRE);
    expect(md).toContain("- Divergent builds crust.");
    expect(md).toContain("## Glossary");
  });
});
