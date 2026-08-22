// The FLOOR under every kit name: `humanizeSourceTitle` runs on every kit,
// including when the namer is unavailable, refuses, or times out. It is the
// difference between "MATH_101-final_v2.pdf" and a title a student recognizes.
//
// It deliberately does NOT invent word boundaries a filename does not contain
// ("MatterandMeasurements" keeps its missing space) — that recovery is the
// namer's job, and a dictionary guess here would corrupt real titles.

import { humanizeSourceTitle } from "../kitTitle";

describe("humanizeSourceTitle", () => {
  it("drops the extension", () => {
    expect(humanizeSourceTitle("photosynthesis.pdf")).toBe("Photosynthesis");
    expect(humanizeSourceTitle("lecture.docx")).toBe("Lecture");
  });

  it("turns separators into spaces and title-cases", () => {
    expect(humanizeSourceTitle("photosynthesis-notes.docx")).toBe(
      "Photosynthesis Notes",
    );
    expect(humanizeSourceTitle("cell_biology_intro.pdf")).toBe(
      "Cell Biology Intro",
    );
  });

  it("splits camelCase and PascalCase runs", () => {
    expect(humanizeSourceTitle("MatterandMeasurements.pdf")).toBe(
      "Matterand Measurements",
    );
    expect(humanizeSourceTitle("cellularRespiration.txt")).toBe(
      "Cellular Respiration",
    );
  });

  it("keeps acronyms intact and splits them off the next word", () => {
    expect(humanizeSourceTitle("GREVocabulary.pdf")).toBe("GRE Vocabulary");
    expect(humanizeSourceTitle("MATH_101.pdf")).toBe("MATH 101");
  });

  it("strips version and duplicate junk a filename accumulates", () => {
    expect(humanizeSourceTitle("MATH_101-final_v2.pdf")).toBe("MATH 101");
    expect(humanizeSourceTitle("chemistry notes (1).pdf")).toBe(
      "Chemistry Notes",
    );
    expect(humanizeSourceTitle("thermodynamics-draft-copy.docx")).toBe(
      "Thermodynamics",
    );
  });

  it("lowercases small words inside the title but never the first", () => {
    expect(humanizeSourceTitle("the_rise_of_rome.pdf")).toBe(
      "The Rise of Rome",
    );
    expect(humanizeSourceTitle("matter-and-measurements.pdf")).toBe(
      "Matter and Measurements",
    );
  });

  it("drops bare scan/date tokens that carry no meaning", () => {
    expect(humanizeSourceTitle("biology_20260817.pdf")).toBe("Biology");
    expect(humanizeSourceTitle("scan_20260817_notes.pdf")).toBe("Notes");
  });

  it("never returns empty — a junk-only filename still yields something", () => {
    expect(humanizeSourceTitle("final_copy_v2.pdf").length).toBeGreaterThan(0);
    expect(humanizeSourceTitle("document.pdf").length).toBeGreaterThan(0);
  });
});
