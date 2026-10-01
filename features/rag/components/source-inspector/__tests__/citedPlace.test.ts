import { citedChunkFacts, citedPages, citedPlace, citedPortion, portionForExcerpt } from "../citedAnchor";

// Real rows (clone, 2026-09-30). The Wikipedia "Enzyme" Source is a scraped
// page: its portions are SECTIONS whose page_number is only an ordinal — the
// References section is portion 31. verify-5 (shots 33-cite-c4 / 34-viewer-c4):
// the popup said "Page 2992" (the agent's locator) and the viewer "Page 31".
const referencesPortion = citedPortion({
  page_number: 31,
  portion_kind: "section",
  locator: { heading_path: ["Enzyme", "References"], text_fragment: "References" },
});
const substratePortion = citedPortion({
  page_number: 10,
  portion_kind: "section",
  locator: { heading_path: ["Enzyme", "Mechanism", "Substrate binding"] },
});
// A YouTube transcript chunk (Crash Course #7) — its time rides on the chunk.
const transcriptChunk = { page_numbers: [12, 13], metadata: { t0_ms: 170_000, t1_ms: 253_000 } };
// A transcript PART (no chunk) — its time rides on the portion's locator.
const segmentPortion = citedPortion({
  page_number: 4,
  portion_kind: "segment",
  locator: { index: 3, t0_ms: 118_000, t1_ms: 164_000 },
});
// A PDF page.
const pdfPortion = citedPortion({ page_number: 36, portion_kind: "page", locator: {} });

describe("one place name for every kind of Source a citation points at", () => {
  it("a web page is named by the section the text sits under — never 'Page N'", () => {
    const facts = { pageNumbers: [31], t0Ms: null, t1Ms: null, portion: referencesPortion };
    const place = citedPlace(citedPages(null, null, facts), facts);
    expect(place).toMatchObject({ kind: "section", label: "References", seekMs: null, pageNumber: 31 });
    expect(place.label).not.toMatch(/page/i);
    const nested = { pageNumbers: [10], t0Ms: null, t1Ms: null, portion: substratePortion };
    expect(citedPlace([10], nested).label).toBe("Mechanism › Substrate binding");
  });

  it("a web section with no heading says nothing rather than a page number", () => {
    const top = citedPortion({ page_number: 1, portion_kind: "section", locator: { heading_path: [] } });
    expect(citedPlace([1], { pageNumbers: [1], t0Ms: null, t1Ms: null, portion: top })).toMatchObject({
      kind: "none",
      label: null,
    });
  });

  it("a video is named by its time and carries where the player starts", () => {
    const facts = { ...citedChunkFacts(transcriptChunk), portion: null };
    const place = citedPlace(citedPages(null, null, facts), facts);
    expect(place).toMatchObject({ kind: "time", label: "2:50–4:13", seekMs: 170_000 });
    const part = { pageNumbers: [4], part: true, t0Ms: null, t1Ms: null, portion: segmentPortion };
    expect(citedPlace([4], part)).toMatchObject({ kind: "time", label: "1:58–2:44", seekMs: 118_000, pageNumber: 4 });
  });

  it("a PDF page is 'Page N' — the citation's own page wins", () => {
    const facts = { pageNumbers: [35], t0Ms: null, t1Ms: null, portion: pdfPortion };
    expect(citedPlace(citedPages(null, 36, facts), facts)).toMatchObject({ kind: "page", label: "Page 36" });
    expect(citedPlace(citedPages(null, 36, null), null).label).toBe("Page 36");
  });

  it("pasted text (a packed part, nothing known) has no place to name", () => {
    const facts = { pageNumbers: null, part: true, t0Ms: null, t1Ms: null };
    expect(citedPlace(citedPages(null, null, facts), facts)).toMatchObject({ kind: "none", label: null });
  });
});

describe("a transcript picked as a RECORD (no document id): the quote finds its moment", () => {
  // Real portions of "Glass-ceramics are amazing!" (clone, 2026-10-01) and the
  // agent's real quote, which drifts after its first three words.
  const rows = [
    { page_number: 22, portion_kind: "segment", locator: { t0_ms: 49_360, t1_ms: 53_680 }, cleaned_text: "expansion coefficient and these are the" },
    { page_number: 23, portion_kind: "segment", locator: { t0_ms: 51_640, t1_ms: 55_719 }, cleaned_text: "secret behind the materials amazing" },
    { page_number: 24, portion_kind: "segment", locator: { t0_ms: 53_680, t1_ms: 57_719 }, cleaned_text: "thermal properties if you want to know" },
  ];

  it("lands on the segment where the quote begins and plays from there", () => {
    const row = portionForExcerpt(rows, "amazing thermal properties of glass-ceramics");
    expect(row?.page_number).toBe(23);
    const facts = { pageNumbers: [23], part: true, t0Ms: null, t1Ms: null, portion: citedPortion(row!) };
    expect(citedPlace([23], facts)).toMatchObject({ kind: "time", label: "0:51–0:55", seekMs: 51_640 });
  });

  it("a quote that is not in the transcript is no place — never a guess", () => {
    expect(portionForExcerpt(rows, "photosynthesis happens in the chloroplast")).toBeNull();
    expect(portionForExcerpt(rows, "the")).toBeNull();
  });
});
