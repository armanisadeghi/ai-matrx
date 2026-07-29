import { parseYouTubeSearchPage, parseYouTubeSearchRequest } from "./types";

describe("YouTube persisted search contracts", () => {
  it("restores a saved request and exact result page", () => {
    const request = parseYouTubeSearchRequest({
      query: "PRP injection research",
      max_results: 50,
      max_results_per_channel: 3,
      video_duration: "any",
      max_duration_minutes: 20,
    });
    const page = parseYouTubeSearchPage({
      search_id: "search-1",
      query: "PRP injection research",
      results: [
        {
          video_id: "video-1",
          url: "https://www.youtube.com/watch?v=video-1",
          title: "Expert lecture",
          duration: "PT12M",
          library_id: "library-1",
        },
      ],
      next_page_token: "next-page",
      total_results: 1000,
    });

    expect(request?.max_results_per_channel).toBe(3);
    expect(request?.max_duration_minutes).toBe(20);
    expect(page?.search_id).toBe("search-1");
    expect(page?.results[0].library_id).toBe("library-1");
    expect(page?.next_page_token).toBe("next-page");
  });

  it("does not present malformed persisted JSON as a replayable search", () => {
    expect(parseYouTubeSearchRequest({ query: 12 })).toBeNull();
    expect(parseYouTubeSearchPage({ query: "missing results" })).toBeNull();
  });
});
