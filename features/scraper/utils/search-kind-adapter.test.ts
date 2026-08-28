import { scraperSearchItemsToKindValue } from "./search-kind-adapter";

describe("scraperSearchItemsToKindValue", () => {
  it("preserves every row while adding the canonical collection and item kinds", () => {
    expect(
      scraperSearchItemsToKindValue("  matrx search  ", [
        {
          title: "AI Matrx",
          url: "https://www.aimatrx.com/search",
          description: "Search across the web.",
          source: "brave",
          rank: 4,
        },
        {
          title: "Second result",
          url: "https://example.com/second",
          snippet: "A second result.",
        },
      ]),
    ).toEqual({
      __kind: "web_search_results",
      source: "brave",
      query: "matrx search",
      total_results: 2,
      results: [
        {
          __kind: "web_result",
          source: "brave",
          position: 4,
          title: "AI Matrx",
          url: "https://www.aimatrx.com/search",
          site_name: "aimatrx.com",
          displayed_url: "https://www.aimatrx.com/search",
          snippet: "Search across the web.",
          thumbnail: null,
          age_text: null,
        },
        {
          __kind: "web_result",
          source: "brave",
          position: 2,
          title: "Second result",
          url: "https://example.com/second",
          site_name: "example.com",
          displayed_url: "https://example.com/second",
          snippet: "A second result.",
          thumbnail: null,
          age_text: null,
        },
      ],
    });
  });
});
