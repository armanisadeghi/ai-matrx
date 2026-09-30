import {
  citedChunkFacts,
  citedPages,
  citedTargetPage,
  pagesLabel,
  timeRangeLabel,
} from "../citedAnchor";

// Real rows from verify-4 (2026-09-30): a Wikipedia web-page Source and a
// captioned YouTube transcript, each cited by chunk id with `page: null`.
const webChunk = { page_numbers: [20], metadata: { first_page: 19, last_page: 19, section_kind: "section" } };
const transcriptChunk = {
  page_numbers: [1, 2, 3, 4, 5, 6, 7, 8],
  metadata: { t0_ms: 0, t1_ms: 77000, section_kind: "segment" },
};

describe("a citation opens AT its cited chunk", () => {
  it("a web-page citation with no page opens on the cited chunk's page, never page 1 ('Jump to content')", () => {
    const pages = citedPages(null, null, citedChunkFacts(webChunk));
    expect(pages).toEqual([20]);
    expect(citedTargetPage(pages)).toBe(20);
  });

  it("a page the citation itself names wins over the chunk row", () => {
    expect(citedPages(null, 7, citedChunkFacts(webChunk))).toEqual([7]);
    expect(citedPages([9, 8, 8], null, citedChunkFacts(webChunk))).toEqual([8, 9]);
  });

  it("with nothing known the viewer opens on page 1 (clamped, never 0)", () => {
    expect(citedTargetPage(citedPages(null, null, null))).toBe(1);
    expect(citedTargetPage(citedPages([0, -2], null, null))).toBe(1);
  });

  it("a transcript segment is named by its time, not 'p.1–8'", () => {
    const facts = citedChunkFacts(transcriptChunk);
    expect(timeRangeLabel(facts.t0Ms, facts.t1Ms)).toBe("0:00–1:17");
    expect(timeRangeLabel(3_725_000, null)).toBe("1:02:05");
    expect(timeRangeLabel(null, null)).toBeNull();
  });

  it("pages read as words", () => {
    expect(pagesLabel([3])).toBe("Page 3");
    expect(pagesLabel([3, 4, 5])).toBe("Pages 3–5");
    expect(pagesLabel([])).toBeNull();
  });
});
