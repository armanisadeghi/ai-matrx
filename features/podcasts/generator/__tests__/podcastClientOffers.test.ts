import { topicIdeaOfferFacts } from "../topicIdeaOffer";
import { webSourceOfferVariables } from "../webSourceOffer";

describe("topicIdeaOfferFacts", () => {
  it("reads the form's real facts, native types", () => {
    expect(
      topicIdeaOfferFacts({
        show: { title: "Yard Talk", description: "Recycling, weekly" },
        format: "interview",
        language: "en",
        hostCount: 2,
        targetAudience: " plant managers ",
      }),
    ).toEqual({
      show_title: "Yard Talk",
      show_description: "Recycling, weekly",
      episode_format: "interview",
      language: "en",
      host_count: 2,
      target_audience: "plant managers",
    });
  });
  it("omits what the form does not hold", () => {
    expect(
      topicIdeaOfferFacts({ show: null, format: "", language: "", hostCount: 0, targetAudience: "" }),
    ).toEqual({});
  });
});

describe("webSourceOfferVariables", () => {
  it("reads the scrape result the resolver already holds", () => {
    const v = webSourceOfferVariables(
      "https://example.com/a",
      {
        url: "https://example.com/a",
        scrapedAt: "2026-09-28T10:00:00.000Z",
        overview: {
          page_title: "Pallet grades",
          website: "example.com",
          char_count: 4200,
          outline: { Intro: [], Grades: ["A", "B"] },
          rtl: false,
        },
      },
      "x".repeat(4100),
    );
    expect(v).toEqual({
      source_url: "https://example.com/a",
      page_title: "Pallet grades",
      website: "example.com",
      char_count: 4200,
      scraped_at: "2026-09-28T10:00:00.000Z",
      page_outline: "- Intro\n- Grades\n  - A\n  - B",
      rtl: false,
    });
    expect("scraped_content" in v).toBe(false);
    expect("focus_area" in v).toBe(false);
  });
  it("falls back to the text it holds and omits absent facts", () => {
    const v = webSourceOfferVariables("https://e.com", { url: "", scrapedAt: "", overview: {} }, "abc");
    expect(v).toEqual({ source_url: "https://e.com", char_count: 3 });
  });
});
