import {
  formatPreReadDisplay,
  formatSourceScoreCoverage,
  preReadDisplayScore,
  priorityScoreTone,
  sourceScoreValues,
} from "../components/sources/sourceScoreDisplay";
import type { ResearchSource } from "../types";

function source(overrides: Partial<ResearchSource> = {}): ResearchSource {
  return {
    id: "s1",
    topic_id: "t1",
    url: "https://example.com",
    title: "Example",
    description: null,
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
    scrape_worthiness: null,
    redundancy_group: null,
    entity_match_confidence: null,
    snippet_relevance: null,
    ...overrides,
  };
}

describe("preReadDisplayScore", () => {
  it("prefers breakdown display over raw score", () => {
    expect(
      preReadDisplayScore(
        source({
          pre_read_score: 71.5,
          pre_read_breakdown: { pre_read_score_display: 72 },
        }),
      ),
    ).toBe(72);
  });

  it("rounds the raw pre_read_score directly (already normalized 0–100)", () => {
    expect(formatPreReadDisplay(source({ pre_read_score: 71.6 }))).toBe("72");
  });
});

describe("sourceScoreValues", () => {
  it("maps all axes for a fully scored source", () => {
    const values = sourceScoreValues(
      source({
        pre_read_score: 72,
        authority_score: 80,
        post_read_score: 79.5,
        final_source_score: 87,
      }),
      3,
    );
    expect(values).toEqual({
      best: "3",
      priority: "72",
      auth: "80",
      post: "80",
      quality: "87",
    });
  });
});

describe("priorityScoreTone", () => {
  it("treats the topic max as top tier even when absolute value is low", () => {
    const topic = [1, 5, 10, 19, 20, 22, 48];
    expect(priorityScoreTone(48, topic).text).toContain("emerald");
    expect(priorityScoreTone(22, topic).text).toContain("emerald");
    expect(priorityScoreTone(1, topic).text).toContain("muted");
  });
});

describe("formatSourceScoreCoverage", () => {
  it("summarizes populated score axes", () => {
    expect(
      formatSourceScoreCoverage([
        source({ pre_read_score: 1, authority_score: 50 }),
        source({
          pre_read_score: 0.5,
          authority_score: 60,
          post_read_score: 70,
          final_source_score: 75,
        }),
      ]),
    ).toBe("2 sources · Priority 2 · Auth 2 · Post 1 · Quality 1");
  });
});
