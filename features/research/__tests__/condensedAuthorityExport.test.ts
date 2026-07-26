import {
  buildCondensedAuthorityExport,
  normalizeSearchSnippets,
  sortRowsForExport,
  truncateSnippetText,
} from "../utils/condensedAuthorityExport";
import type { CurationRow } from "../service";

function row(overrides: Partial<CurationRow["source"]> = {}): CurationRow {
  return {
    source: {
      id: "src-1",
      topic_id: "topic-1",
      url: "https://example.com/page",
      title: "Example",
      description: "A description",
      hostname: "example.com",
      source_type: "web",
      origin: "search",
      rank: 1,
      page_age: null,
      thumbnail_url: null,
      extra_snippets: null,
      raw_search_result: null,
      is_included: true,
      is_stale: null,
      scrape_status: "pending",
      discovered_at: null,
      last_seen_at: null,
      authority_score: null,
      authority_tier: null,
      authority_reasoning: null,
      authority_ranked_at: null,
      page_analysis: null,
      post_read_score: null,
      final_source_score: null,
      recommended_use: null,
      analysis_status: null,
      pre_read_score: null,
      pre_read_breakdown: null,
      ...overrides,
    },
    importance: null,
    charCount: null,
    analysis: "none",
    tags: [],
  };
}

describe("normalizeSearchSnippets", () => {
  it("accepts string arrays", () => {
    expect(normalizeSearchSnippets(["one", " two "])).toEqual(["one", "two"]);
  });

  it("accepts snippet objects", () => {
    expect(
      normalizeSearchSnippets([{ text: "alpha" }, { snippet: "beta" }]),
    ).toEqual(["alpha", "beta"]);
  });
});

describe("buildCondensedAuthorityExport", () => {
  it("keeps url/title/description/age/snippets only", () => {
    const payload = buildCondensedAuthorityExport("topic-1", "Topic", [
      row({
        extra_snippets: ["AI snippet one", "AI snippet two"],
        page_age: "2 days ago",
        raw_search_result: {
          profile: { long_name: "Example Publisher" },
        },
      }),
    ]);

    expect(payload.sources).toEqual([
      {
        url: "https://example.com/page",
        title: "Example",
        description: "A description",
        age: "2 days ago",
        snippets: ["AI snippet one", "AI snippet two"],
      },
    ]);
  });

  it("deduplicates by url", () => {
    const payload = buildCondensedAuthorityExport("topic-1", null, [
      row({ id: "a", url: "https://dup.test/a" }),
      row({ id: "b", url: "https://dup.test/a", title: "Duplicate" }),
    ]);
    expect(payload.sourceCount).toBe(1);
  });

  it("orders by priority (pre-read) first", () => {
    const payload = buildCondensedAuthorityExport("topic-1", null, [
      row({
        id: "low-priority",
        url: "https://example.com/low",
        title: "Low priority",
        pre_read_score: 0.2,
        final_source_score: 95,
      }),
      row({
        id: "high-priority",
        url: "https://example.com/high",
        title: "High priority",
        pre_read_score: 1.2,
        final_source_score: 20,
      }),
    ]);

    expect(payload.sources.map((s) => s.title)).toEqual([
      "High priority",
      "Low priority",
    ]);
  });

  it("truncates snippets when snippetMaxChars is set", () => {
    const long = "a".repeat(400);
    const payload = buildCondensedAuthorityExport(
      "topic-1",
      null,
      [row({ extra_snippets: [long, "short"] })],
      { snippetMaxChars: 250 },
    );

    expect(payload.sources[0].snippets).toEqual([
      `${"a".repeat(250)}…`,
      "short",
    ]);
  });
});

describe("truncateSnippetText", () => {
  it("leaves short text unchanged", () => {
    expect(truncateSnippetText("hello", 100)).toBe("hello");
  });

  it("is a no-op when max is 0", () => {
    expect(truncateSnippetText("hello world", 0)).toBe("hello world");
  });
});

describe("sortRowsForExport", () => {
  it("sorts by pre-read before authority when quality is missing", () => {
    const sorted = sortRowsForExport([
      row({
        id: "b",
        url: "https://example.com/b",
        authority_score: 80,
        pre_read_score: 50,
      }),
      row({
        id: "a",
        url: "https://example.com/a",
        authority_score: 60,
        pre_read_score: 72,
      }),
    ]);

    expect(sorted.map((r) => r.source.id)).toEqual(["a", "b"]);
  });

  it("sorts by pre-read before quality when both exist", () => {
    const sorted = sortRowsForExport([
      row({
        id: "high-quality",
        pre_read_score: 20,
        final_source_score: 99,
      }),
      row({
        id: "high-priority",
        pre_read_score: 95,
        final_source_score: 10,
      }),
    ]);

    expect(sorted.map((r) => r.source.id)).toEqual([
      "high-priority",
      "high-quality",
    ]);
  });
});
