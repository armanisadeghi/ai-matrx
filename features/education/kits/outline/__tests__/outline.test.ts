import {
  isOutlineStale,
  outlineRunSources,
  outlineSectionsFromRows,
  sectionGroupText,
  type OutlineRow,
} from "../outlineService";
import { countsOf, kitCoverage } from "../coverage";
import { gapSections } from "@/features/education/convert/steering";

const rows: OutlineRow[] = [
  {
    id: "sec-b",
    position: 1,
    title: "Isotopes",
    summary: "Same element, different neutrons.",
    body: "Isotopes are atoms of one element with different numbers of neutrons.",
    claims: [
      { statement: "Carbon-12 and carbon-14 are isotopes.", source_chunk_ids: ["c2"] },
      { statement: "   ", source_chunk_ids: ["c9"] },
    ],
    metadata: { cited_chunk_ids: ["c2", "c3"], built_by_run_id: "run-1" },
  },
  {
    id: "sec-a",
    position: 0,
    title: "Dalton's atomic theory",
    summary: "Matter is made of atoms.",
    body: "Dalton proposed that all matter is composed of indivisible atoms.",
    claims: [{ statement: "Atoms of one element are identical in mass.", source_chunk_ids: ["c1"] }],
    metadata: { cited_chunk_ids: ["c1"] },
  },
];

describe("outline mapping", () => {
  it("orders by position and reads facts with their cited chunks", () => {
    const sections = outlineSectionsFromRows(rows);
    expect(sections.map((s) => s.id)).toEqual(["sec-a", "sec-b"]);
    expect(sections[1].facts).toEqual([{ statement: "Carbon-12 and carbon-14 are isotopes.", chunkIds: ["c2"] }]);
    expect(sections[1].chunkIds).toEqual(["c2", "c3"]);
  });

  it("a section group carries chunk markers then key facts", () => {
    const [, isotopes] = outlineSectionsFromRows(rows);
    const text = sectionGroupText(isotopes, [{ id: "c2", content: "Carbon has isotopes." }]);
    expect(text).toContain("### Chunk c2\nCarbon has isotopes.");
    expect(text).toContain("Key facts:\n- Carbon-12 and carbon-14 are isotopes.");
    // No cited text stored: the section body stands in.
    expect(sectionGroupText(isotopes, [])).toContain("different numbers of neutrons");
  });
});

describe("outline run sources and staleness", () => {
  const kitSources = [
    { type: "processed_document", id: "pd-1", title: "Chemistry 2e ch. 2" },
    { type: "file", id: "f-1", title: "Lecture slides" },
    { type: "note", id: "n-1", title: "My notes" },
    { type: "web_page", id: "w-1", title: "A page" },
  ];
  const notes = new Map([["n-1", "Protons define the element."]]);

  it("maps each Source to its one locator and names what it cannot read", () => {
    const { sources, skipped } = outlineRunSources(kitSources, notes);
    expect(sources).toEqual([
      { label: "Chemistry 2e ch. 2", processed_document_id: "pd-1" },
      { label: "Lecture slides", file_id: "f-1" },
      { label: "My notes", note: "Protons define the element." },
    ]);
    expect(skipped).toEqual(["A page"]);
  });

  it("is stale exactly when the Sources read differ (order-insensitive)", () => {
    const { sources } = outlineRunSources(kitSources, notes);
    const built = [...sources].reverse().map((s) => ({ ...s, label: "renamed" }));
    expect(isOutlineStale(sources, built)).toBe(false);
    expect(isOutlineStale(sources, built.slice(1))).toBe(true);
    expect(isOutlineStale(sources, built.map((s) => (s.note ? { ...s, note: "edited" } : s)))).toBe(true);
    expect(isOutlineStale(sources, null)).toBe(false);
  });
});

describe("coverage counting", () => {
  const sections = outlineSectionsFromRows(rows);
  it("counts by section id; unknown and missing ids are Not mapped", () => {
    const cov = kitCoverage(
      sections,
      [{ sectionId: "sec-a" }, { sectionId: "sec-a" }, { sectionId: null }, { sectionId: "vanished" }],
      [{ sectionId: "sec-b" }],
    );
    expect(cov.rows).toEqual([
      { sectionId: "sec-a", title: "Dalton's atomic theory", cards: 2, questions: 0 },
      { sectionId: "sec-b", title: "Isotopes", cards: 0, questions: 1 },
    ]);
    expect(cov.unmapped).toEqual({ cards: 2, questions: 0 });
    expect(cov.max).toBe(2);
    // Gaps for a deck = the sections with the fewest cards.
    expect(gapSections(sections, countsOf(cov, "cards")).map((s) => s.id)).toEqual(["sec-b"]);
  });
});
