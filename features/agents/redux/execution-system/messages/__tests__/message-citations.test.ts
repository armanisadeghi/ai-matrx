/**
 * Unit guard for the settle-time citation layer (message-citations.ts):
 * boundary parsing of `TextPart.citations` (unknown[]), dedupe + numbering,
 * marker insertion (answer offsets vs end-append), and marker stripping.
 * Contract: docs/handoffs/citations-system.md "Canonical citation schema".
 */

import {
  buildMessageCitationIndex,
  citationMarkerTag,
  citationSourceDisplayKind,
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

describe("search_result citations (RAG / document_search tool results)", () => {
  // The backend emits kind:"search_result" carrying OUR file_id + page
  // (decoded from matrx:// sources); url is null.
  const searchResult = (over: Record<string, unknown> = {}) =>
    citation({
      kind: "search_result",
      cited_text: "quoted from the tool result",
      title: "Q3 Report.pdf",
      url: null,
      file_id: "file-sr-1",
      page: 7,
      source_start: null,
      source_end: null,
      answer_start: null,
      answer_end: null,
      raw: { type: "search_result_location" },
      ...over,
    });

  it("produces a numbered source deduped by (kind, file_id, page)", () => {
    const idx = buildMessageCitationIndex([
      {
        type: "text",
        text: "Revenue grew.",
        citations: [
          searchResult(),
          // Same file+page, different quote → SAME source (count 2).
          searchResult({ cited_text: "another quote from the same page" }),
          // Same file, different page → distinct source.
          searchResult({ page: 9 }),
          // Different file, same page → distinct source.
          searchResult({ file_id: "file-sr-2" }),
        ],
      },
    ]);
    expect(idx.sources.map((s) => s.number)).toEqual([1, 2, 3]);
    expect(idx.sources[0]).toMatchObject({
      kind: "search_result",
      fileId: "file-sr-1",
      page: 7,
      url: null,
      count: 2,
      title: "Q3 Report.pdf",
    });
    expect(idx.sources[1]).toMatchObject({ fileId: "file-sr-1", page: 9 });
    expect(idx.sources[2]).toMatchObject({ fileId: "file-sr-2", page: 7 });
    // One chip marker per distinct source on the part.
    expect(idx.markersByPartIndex[0]).toEqual([
      { sourceNumber: 1, answerEnd: null },
      { sourceNumber: 2, answerEnd: null },
      { sourceNumber: 3, answerEnd: null },
    ]);
  });

  it("dedupe keys on file_id, not title — same title over different files stays distinct", () => {
    const idx = buildMessageCitationIndex([
      {
        type: "text",
        text: "x",
        citations: [
          searchResult({ file_id: "file-a" }),
          searchResult({ file_id: "file-b" }),
        ],
      },
    ]);
    expect(idx.sources).toHaveLength(2);
  });

  it("reads as a document, never a globe — even when a url is present", () => {
    const idx = buildMessageCitationIndex([
      { type: "text", text: "x", citations: [searchResult()] },
    ]);
    expect(citationSourceDisplayKind(idx.sources[0])).toBe("document");
    // Hypothetical search_result with a url and no file_id: still a document.
    expect(
      citationSourceDisplayKind({
        kind: "search_result",
        url: "https://example.com",
        fileId: null,
      }),
    ).toBe("document");
    // Sanity: web stays web; grounding resolved to our file reads as document.
    expect(
      citationSourceDisplayKind({ kind: "web", url: "https://x.com", fileId: null }),
    ).toBe("web");
    expect(
      citationSourceDisplayKind({ kind: "grounding", url: "https://x.com", fileId: "f1" }),
    ).toBe("document");
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

describe("insertCitationMarkers — overlapping citations", () => {
  it("stacks multiple sources at the same offset in marker order", () => {
    const out = insertCitationMarkers("abcdef", [
      { sourceNumber: 1, answerEnd: 4 },
      { sourceNumber: 2, answerEnd: 4 },
      { sourceNumber: 3, answerEnd: 2 },
    ]);
    expect(out).toBe(
      'ab<matrxcite n="3" />cd<matrxcite n="1" /><matrxcite n="2" />ef',
    );
  });

  it("mixes offset and end-append markers without corrupting either", () => {
    const text = "Claim one and claim two. ";
    const out = insertCitationMarkers(text, [
      { sourceNumber: 1, answerEnd: 9 },
      { sourceNumber: 2, answerEnd: null },
    ]);
    expect(out).toBe(
      'Claim one<matrxcite n="1" /> and claim two.<matrxcite n="2" /> ',
    );
    expect(stripCitationMarkers(out)).toBe(text);
  });
});

describe("insertCitationMarkers — markdown code regions", () => {
  it("snaps an offset inside an inline code span to just after the closing backtick", () => {
    // Offset 7 is inside `foo()` — the marker must not land inside the span.
    const text = "Use `foo()` here";
    const out = insertCitationMarkers(text, [{ sourceNumber: 1, answerEnd: 7 }]);
    expect(out).toBe('Use `foo()`<matrxcite n="1" /> here');
    expect(stripCitationMarkers(out)).toBe(text);
  });

  it("handles multi-backtick inline spans (`` … ``)", () => {
    const text = "Run ``a ` b`` now";
    const out = insertCitationMarkers(text, [{ sourceNumber: 1, answerEnd: 6 }]);
    expect(out).toBe('Run ``a ` b``<matrxcite n="1" /> now');
  });

  it("snaps an offset inside a fenced block to just after the closing fence", () => {
    const text = "Intro\n```js\nconst x = 1;\n```\nAfter";
    // Offset 15 lands inside `const x = 1;`.
    const out = insertCitationMarkers(text, [
      { sourceNumber: 1, answerEnd: 15 },
    ]);
    expect(out).toBe(
      'Intro\n```js\nconst x = 1;\n```<matrxcite n="1" />\nAfter',
    );
    expect(stripCitationMarkers(out)).toBe(text);
  });

  it("an unclosed fence snaps the marker to end-of-text", () => {
    const text = "Intro\n```\ncode still streaming";
    const out = insertCitationMarkers(text, [
      { sourceNumber: 1, answerEnd: 12 },
    ]);
    expect(out).toBe('Intro\n```\ncode still streaming<matrxcite n="1" />');
  });

  it("does not disturb offsets at region boundaries or in plain text with stray backticks", () => {
    // Offset exactly BEFORE the opening backtick is fine.
    const text = "See `x` ok";
    expect(
      insertCitationMarkers(text, [{ sourceNumber: 1, answerEnd: 4 }]),
    ).toBe('See <matrxcite n="1" />`x` ok');
    // An unpaired backtick run is literal text, not a region.
    expect(
      insertCitationMarkers("a ` b c", [{ sourceNumber: 1, answerEnd: 3 }]),
    ).toBe('a `<matrxcite n="1" /> b c');
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

describe("computeCodeRegions — blockquote/indented fences (adversarial fixes)", () => {
  const { computeCodeRegions, insertCitationMarkers } = jest.requireActual(
    "../message-citations",
  );

  it("detects an unclosed fence behind blockquote markers", () => {
    const text = "> intro\n> ```js\n> const apiKey = 'secret';";
    const regions = computeCodeRegions(text);
    expect(regions.length).toBeGreaterThan(0);
    const out = insertCitationMarkers(text, [{ sourceNumber: 1, answerEnd: 30 }]);
    // Marker must snap to end-of-text (unclosed fence), never inside the code.
    expect(out.indexOf("<matrxcite")).toBe(text.length);
  });

  it("detects an unclosed 4-space-indented fence", () => {
    const text = "    ```js\n    const apiKey = 'secret';";
    const out = insertCitationMarkers(text, [{ sourceNumber: 1, answerEnd: 25 }]);
    expect(out.indexOf("<matrxcite")).toBe(text.length);
  });

  it("closes a blockquoted fence and keeps text after it markable", () => {
    const text = "> ```js\n> code();\n> ```\nafter text here";
    const regions = computeCodeRegions(text);
    expect(regions.length).toBe(1);
    const fenceEnd = regions[0][1];
    const out = insertCitationMarkers(text, [{ sourceNumber: 2, answerEnd: 5 }]);
    const at = out.indexOf("<matrxcite");
    expect(at).toBeGreaterThanOrEqual(fenceEnd);
  });

  it("memoizes results for identical strings", () => {
    const text = "some `inline` code";
    expect(computeCodeRegions(text)).toBe(computeCodeRegions(text));
  });
});
