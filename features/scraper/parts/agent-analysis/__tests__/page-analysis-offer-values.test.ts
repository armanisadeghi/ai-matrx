/** Provision pass wave 4 — `scraper.page_analysis` facts by declared name. */
import { pageAnalysisOfferValues } from "../page-analysis-offer-values";

describe("pageAnalysisOfferValues", () => {
  it("maps a real scrape result to the declared names with native types", () => {
    expect(
      pageAnalysisOfferValues({
        overview: {
          page_title: "Lip Filler Men: Cost, Info, Results",
          url: "https://cosmeticinjectables.com/procedures/lip-filler/",
          website: "cosmeticinjectables.com",
          char_count: 8421,
          outline: { "H1: Lip Filler for Men": [], "H2: Cost": [] },
          table_count: 0,
          list_count: 10,
        },
        structuredData: [{ "@type": "MedicalProcedure" }],
        links: { internal: ["/a", "/b"], external: ["https://x.example"] },
        scrapedAt: "2026-09-28T10:00:00Z",
      }),
    ).toEqual({
      page_title: "Lip Filler Men: Cost, Info, Results",
      page_url: "https://cosmeticinjectables.com/procedures/lip-filler/",
      website: "cosmeticinjectables.com",
      char_count: 8421,
      page_outline: "- H1: Lip Filler for Men\n- H2: Cost",
      table_count: 0,
      list_count: 10,
      structured_data: '[{"@type":"MedicalProcedure"}]',
      scraped_at: "2026-09-28T10:00:00Z",
      internal_link_count: 2,
      external_link_count: 1,
    });
  });

  it("omits every absent fact (and never sends page_content)", () => {
    expect(
      pageAnalysisOfferValues({
        overview: { page_title: "", outline: {} },
        structuredData: {},
        links: null,
      }),
    ).toEqual({});
  });
});
