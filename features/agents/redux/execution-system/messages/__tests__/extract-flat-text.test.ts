/**
 * REGRESSION GUARD: extractFlatText over multi-text-block messages.
 *
 * Provider contract (Anthropic citations, OpenAI output items): consecutive
 * `text` blocks in one message are SEGMENTS of one continuous string. A
 * citation-bearing response arrives split MID-SENTENCE (`"…ratios"`, `", and "`,
 * `"AMA whole person…"`). Joining segments with "\n" broke words and
 * punctuation onto their own lines (live incident 2026-07-16, conversation
 * 883f68c6-55b2-485d-9ae6-124716a495a6). Text segments must concatenate
 * directly; only non-text blocks keep the newline separator.
 */

import {
  extractFlatText,
  extractInspectableText,
  stringifyStructuredContent,
} from "../messages.selectors";
import type { MessageRecord } from "../messages.slice";

function record(content: unknown[]): MessageRecord {
  return { content } as unknown as MessageRecord;
}

describe("extractFlatText", () => {
  it("concatenates consecutive text blocks directly (citation-split segments)", () => {
    const rec = record([
      { type: "text", text: "Factors were established", citations: [] },
      { type: "text", text: ", and ", citations: [] },
      { type: "text", text: "ratings receive a higher FEC adjustment", citations: [] },
      { type: "text", text: ".", citations: [] },
    ]);
    expect(extractFlatText(rec)).toBe(
      "Factors were established, and ratings receive a higher FEC adjustment.",
    );
  });

  it("still excludes thinking blocks and keeps single-block behavior", () => {
    const rec = record([
      { type: "thinking", text: "internal reasoning" },
      { type: "text", text: "The answer." },
    ]);
    expect(extractFlatText(rec)).toBe("The answer.");
  });
});

// ---------------------------------------------------------------------------
// Inspectable content — "structured content renders blank" class guard.
//
// REGRESSION (2026-08-30, conversation 044b4a9d-b3b0-4915-aec3-adf6dd40b5e1,
// message a386aede-9a59-46f5-b4c2-83f018613c43): an assistant message whose
// stored `content` is a pure media-block array flattened to "" and the edit /
// raw-data view rendered NOTHING — the creator could not see what the agent
// returned. Every raw/inspect surface must show the stored payload:
// pretty-printed JSON with `isStructuredRaw: true` when no text exists.
// ---------------------------------------------------------------------------

describe("extractInspectableText", () => {
  const mediaArray = [
    {
      url: "https://example.com/x.png",
      kind: "image",
      type: "media",
      file_id: "f-1",
      metadata: { width: 512 },
    },
  ];

  it("returns pretty-printed JSON for a pure media-block content array", () => {
    const rec = record(mediaArray);
    const result = extractInspectableText(rec);
    expect(result.isStructuredRaw).toBe(true);
    expect(result.text).toBe(JSON.stringify(mediaArray, null, 2));
    // The old behavior — the defect — was an empty string.
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("returns the flat text (not JSON) when the message carries text", () => {
    const rec = record([
      { type: "text", text: "The answer." },
      ...mediaArray,
    ]);
    expect(extractInspectableText(rec)).toEqual({
      text: "The answer.",
      isStructuredRaw: false,
    });
  });

  it("returns an honest empty for truly empty content", () => {
    expect(extractInspectableText(record([]))).toEqual({
      text: "",
      isStructuredRaw: false,
    });
    expect(extractInspectableText(undefined)).toEqual({
      text: "",
      isStructuredRaw: false,
    });
  });

  it("passes plain-string content through as text, not structured raw", () => {
    const rec = { content: "plain stored string" } as unknown as MessageRecord;
    expect(extractInspectableText(rec)).toEqual({
      text: "plain stored string",
      isStructuredRaw: false,
    });
  });
});

describe("stringifyStructuredContent", () => {
  it("nulls out empty payloads and pretty-prints objects", () => {
    expect(stringifyStructuredContent(null)).toBeNull();
    expect(stringifyStructuredContent([])).toBeNull();
    expect(stringifyStructuredContent({})).toBeNull();
    expect(stringifyStructuredContent({ a: 1 })).toBe(
      JSON.stringify({ a: 1 }, null, 2),
    );
  });
});

// ---------------------------------------------------------------------------
// Citation markers (settle-time citation UI — docs/handoffs/citations-system.md)
// ---------------------------------------------------------------------------

function citation(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "document_page",
    provider: "anthropic",
    cited_text: "Factors were established by the committee.",
    title: "Underwriting Guide.pdf",
    url: null,
    source_index: 0,
    file_id: "file-abc",
    page: 12,
    end_page: null,
    source_start: 0,
    source_end: 0,
    answer_start: 0,
    answer_end: 0,
    raw: {},
    ...over,
  };
}

describe("extractFlatText with citation markers", () => {
  it("appends numbered markers to cited blocks; plain path stays marker-free", () => {
    const rec = record([
      { type: "text", text: "Factors were established", citations: [citation()] },
      { type: "text", text: ", and ", citations: [] },
      {
        type: "text",
        text: "ratings receive a higher FEC adjustment",
        citations: [citation({ page: 31 })],
      },
      { type: "text", text: ".", citations: [] },
    ]);

    // Plain flatten (copy / TTS / share) is byte-identical to before.
    expect(extractFlatText(rec)).toBe(
      "Factors were established, and ratings receive a higher FEC adjustment.",
    );

    // Marker flatten hugs the cited text (page 12 → source 1, page 31 → source 2).
    expect(extractFlatText(rec, { withCitationMarkers: true })).toBe(
      'Factors were established<matrxcite n="1" />, and ' +
        'ratings receive a higher FEC adjustment<matrxcite n="2" />.',
    );
  });

  it("dedupes repeated sources into one number", () => {
    const rec = record([
      { type: "text", text: "First claim. ", citations: [citation()] },
      { type: "text", text: "Second claim.", citations: [citation()] },
    ]);
    // Trailing whitespace on the first block: marker inserts BEFORE it so the
    // chip hugs the cited sentence.
    expect(extractFlatText(rec, { withCitationMarkers: true })).toBe(
      'First claim.<matrxcite n="1" /> Second claim.<matrxcite n="1" />',
    );
  });

  it("inserts at answer_end when offsets are provided (OpenAI/Gemini shapes)", () => {
    const rec = record([
      {
        type: "text",
        text: "Alpha beta gamma.",
        citations: [
          citation({
            kind: "web",
            provider: "openai",
            url: "https://example.com/a",
            file_id: null,
            page: null,
            answer_start: 0,
            answer_end: 10, // after "Alpha beta"
          }),
        ],
      },
    ]);
    expect(extractFlatText(rec, { withCitationMarkers: true })).toBe(
      'Alpha beta<matrxcite n="1" /> gamma.',
    );
  });

  it("skips malformed citations loudly without throwing", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const rec = record([
        {
          type: "text",
          text: "Claim.",
          citations: [
            null,
            42,
            { kind: "not_a_real_kind" },
            citation({ url: "https://example.com" }),
          ],
        },
      ]);
      expect(extractFlatText(rec, { withCitationMarkers: true })).toBe(
        'Claim.<matrxcite n="1" />',
      );
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("returns unmarked text for messages without citations", () => {
    const rec = record([{ type: "text", text: "No citations here." }]);
    expect(extractFlatText(rec, { withCitationMarkers: true })).toBe(
      "No citations here.",
    );
  });
});
