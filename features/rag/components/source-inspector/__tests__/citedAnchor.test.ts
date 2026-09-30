import { isUuidShape } from "@ai-matrx/kit/uuid";
import {
  pageForPartOrdinal,
  parsePartId,
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

describe("a citation that names a PART (a document with no search index yet)", () => {
  // Clone run 2026-09-30: the Wikipedia Source had no chunks, so the resolver
  // named page parts `<document id>:<n>` and the cards cited ":16", ":15", ":31".
  const DOC = "19141cb7-8704-44f4-bccb-e2d99f1f9ca0";

  it("is told apart from a chunk id", () => {
    expect(isUuidShape("4b479083-7728-4777-9e9a-149a482dfa3a")).toBe(true);
    expect(isUuidShape(`${DOC}:16`)).toBe(false);
    expect(parsePartId(`${DOC}:16`)).toEqual({ documentId: DOC, ordinal: 16 });
    expect(parsePartId("4b479083-7728-4777-9e9a-149a482dfa3a")).toBeNull();
    expect(parsePartId(`${DOC}:0`)).toBeNull();
  });

  it("opens on the n-th page that has text — the server's own count", () => {
    const rows = [
      { page_number: 3, cleaned_char_count: 900 },
      { page_number: 1, cleaned_char_count: 15 },
      { page_number: 2, cleaned_char_count: 0, raw_char_count: 0 },
      { page_number: 4, raw_char_count: 40 },
    ];
    expect(pageForPartOrdinal(rows, 1)).toBe(1);
    expect(pageForPartOrdinal(rows, 2)).toBe(3); // page 2 is empty and was never a part
    expect(pageForPartOrdinal(rows, 3)).toBe(4);
    expect(pageForPartOrdinal(rows, 4)).toBeNull();
  });
});
