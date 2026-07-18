/**
 * Unit guard for the settle-time citation layer (message-citations.ts):
 * boundary parsing of `TextPart.citations` (unknown[]), dedupe + numbering,
 * marker insertion (answer offsets vs end-append), and marker stripping.
 * Contract: docs/handoffs/citations-system.md "Canonical citation schema".
 */

import {
  buildMessageCitationIndex,
  citationMarkerTag,
  EMPTY_CITATION_INDEX,
  insertCitationMarkers,
  parseNormalizedCitation,
  partsHaveCitations,
  stripCitationMarkers,
} from "../message-citations";

function citation(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "document_page",
    provider: "anthropic",
    cited_text: "verbatim source text",
    title: "Guide.pdf",
    url: null,
    source_index: 0,
    file_id: "file-1",
    page: 3,
    end_page: null,
    source_start: 10,
    source_end: 42,
    answer_start: 0,
    answer_end: 0,
    raw: { type: "page_location" },
    ...over,
  };
}

describe("parseNormalizedCitation", () => {
  it("accepts a contract-conforming citation", () => {
    const c = parseNormalizedCitation(citation());
    expect(c).not.toBeNull();
    expect(c?.kind).toBe("document_page");
    expect(c?.file_id).toBe("file-1");
    expect(c?.page).toBe(3);
  });

  it("rejects non-objects and unknown kinds", () => {
    expect(parseNormalizedCitation(null)).toBeNull();
    expect(parseNormalizedCitation("x")).toBeNull();
    expect(parseNormalizedCitation([])).toBeNull();
    expect(parseNormalizedCitation({ kind: "bogus" })).toBeNull();
    expect(parseNormalizedCitation({ provider: "anthropic" })).toBeNull();
  });

  it("nullifies malformed field values instead of throwing", () => {
    const c = parseNormalizedCitation(
      citation({ page: "twelve", url: 7, title: "", raw: "nope" }),
    );
    expect(c).not.toBeNull();
    expect(c?.page).toBeNull();
    expect(c?.url).toBeNull();
    expect(c?.title).toBeNull();
    expect(c?.raw).toEqual({});
  });
});

describe("buildMessageCitationIndex", () => {
  it("returns the stable empty index when no part has citations", () => {
    expect(
      buildMessageCitationIndex([{ type: "text", text: "hi" }]),
    ).toBe(EMPTY_CITATION_INDEX);
    expect(partsHaveCitations([{ type: "text", citations: [] }])).toBe(false);
  });

  it("numbers sources in first-appearance order and dedupes by (kind, target, page)", () => {
    const idx = buildMessageCitationIndex([
      { type: "text", text: "a", citations: [citation()] },
      {
        type: "text",
        text: "b",
        citations: [citation({ page: 9 }), citation()],
      },
      {
        type: "text",
        text: "c",
        citations: [
          citation({ kind: "web", url: "https://x.com", file_id: null, page: null }),
        ],
      },
    ]);
    // page 3 (dupe across parts) → 1, page 9 → 2, web → 3
    expect(idx.sources.map((s) => s.number)).toEqual([1, 2, 3]);
    expect(idx.sources[0].count).toBe(2);
    expect(idx.markersByPartIndex[0]).toEqual([
      { sourceNumber: 1, answerEnd: null },
    ]);
    expect(idx.markersByPartIndex[1]).toEqual([
      { sourceNumber: 2, answerEnd: null },
      { sourceNumber: 1, answerEnd: null },
    ]);
    expect(idx.markersByPartIndex[2]).toEqual([
      { sourceNumber: 3, answerEnd: null },
    ]);
  });

  it("skips non-text parts and warns once for malformed items", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const idx = buildMessageCitationIndex([
        { type: "tool_call", citations: [citation()] },
        { type: "text", text: "x", citations: [{ bad: true }, citation()] },
      ]);
      expect(idx.sources).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("insertCitationMarkers / stripCitationMarkers", () => {
  it("appends end markers before trailing whitespace", () => {
    expect(
      insertCitationMarkers(", and ", [{ sourceNumber: 2, answerEnd: null }]),
    ).toBe(', and<matrxcite n="2" /> ');
  });

  it("inserts offset markers at answer_end, descending-safe", () => {
    const out = insertCitationMarkers("abcdef", [
      { sourceNumber: 1, answerEnd: 2 },
      { sourceNumber: 2, answerEnd: 4 },
    ]);
    expect(out).toBe('ab<matrxcite n="1" />cd<matrxcite n="2" />ef');
  });

  it("clamps out-of-range offsets", () => {
    expect(
      insertCitationMarkers("ab", [{ sourceNumber: 1, answerEnd: 99 }]),
    ).toBe('ab<matrxcite n="1" />');
  });

  it("strip removes exactly what insert added", () => {
    const text = "Cited claim, and more.";
    const marked = insertCitationMarkers(text, [
      { sourceNumber: 3, answerEnd: 11 },
      { sourceNumber: 1, answerEnd: null },
    ]);
    expect(marked).toContain(citationMarkerTag(3));
    expect(stripCitationMarkers(marked)).toBe(text);
    expect(stripCitationMarkers(text)).toBe(text);
  });
});

describe("insertCitationMarkers — unicode safety", () => {
  it("never splits a surrogate pair (emoji) when a provider offset lands mid-glyph", () => {
    // "ok 🚀 done" — 🚀 is a surrogate pair at UTF-16 indices 3-4. A provider
    // code-point offset of 4 lands on the low surrogate; the marker must be
    // nudged past the pair, keeping the glyph intact.
    const text = "ok \u{1F680} done";
    const marked = insertCitationMarkers(text, [{ sourceNumber: 1, answerEnd: 4 }]);
    expect(marked).toContain("\u{1F680}");
    expect(marked).toBe('ok \u{1F680}<matrxcite n="1" /> done');
    expect(stripCitationMarkers(marked)).toBe(text);
  });

  it("keeps identity-less citations with different quotes as distinct sources", () => {
    const mk = (cited_text: string) => ({
      kind: "document_char",
      provider: "anthropic",
      cited_text,
      title: null,
      url: null,
      source_index: 0,
      file_id: null,
      page: null,
      end_page: null,
      source_start: null,
      source_end: null,
      answer_start: null,
      answer_end: null,
      raw: {},
    });
    const index = buildMessageCitationIndex([
      { partIndex: 0, citations: [mk("first quote")] },
      { partIndex: 1, citations: [mk("second quote")] },
    ]);
    expect(index.sources).toHaveLength(2);
  });
});
