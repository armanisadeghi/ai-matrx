/**
 * Seated walk #2 (09b): Search & Scrape with Max pages = 2 rendered 6 rows —
 * the server's 4 SEARCH HITS (`type: "search_results"`, no body, no Source)
 * were appended as scraped pages beside the 2 pages actually read, so each
 * hit showed "not added to your Sources, and the server did not say why" and
 * two URLs appeared twice. A scrape surface lists only pages it read.
 */
import { extractResultsFromData } from "@/features/scraper/hooks/useScraperApi";

const searchHits = {
  type: "search_results",
  metadata: { keyword: "mediterranean diet benefits" },
  results: [
    { url: "https://a.example/1", title: "A" },
    { url: "https://b.example/2", title: "B" },
    { url: "https://c.example/3", title: "C" },
    { url: "https://d.example/4", title: "D" },
  ],
};
const page = (url: string) => ({
  type: "fetch_results",
  metadata: { execution_time_ms: 1 },
  results: [{ url, success: true, text_data: "body", processed_document_id: "doc" }],
});

describe("scrape stream rows", () => {
  it("a scrape surface keeps only the pages read — never the search hits", () => {
    let acc = { results: [] as Record<string, unknown>[], metadata: {} as Record<string, unknown> };
    for (const ev of [searchHits, page("https://a.example/1"), page("https://c.example/3")]) {
      acc = extractResultsFromData(ev, acc.results, acc.metadata, { pagesOnly: true });
    }
    expect(acc.results.map((r) => r.url)).toEqual(["https://a.example/1", "https://c.example/3"]);
  });

  it("a search surface still receives its hits", () => {
    const acc = extractResultsFromData(searchHits, [], {});
    expect(acc.results).toHaveLength(4);
  });
});

import { searchAndScrapeReport } from "@/features/scraper/hooks/useScraperApi";

describe("the run's report", () => {
  it("keeps the hits as found candidates and each unsaved page with its reason", () => {
    let acc = extractResultsFromData(searchHits, [], {}, { pagesOnly: true });
    // A page arriving after the hits must not erase them.
    acc = extractResultsFromData(page("https://a.example/1"), acc.results, acc.metadata, { pagesOnly: true });
    const report = searchAndScrapeReport({
      ...acc.metadata,
      pages_not_saved: [{ url: "https://b.example/2", reason: "The site answered 403." }],
    });
    expect(report?.candidates.map((c) => c.url)).toHaveLength(4);
    expect(report?.notSaved).toEqual([
      { url: "https://b.example/2", reason: "The site answered 403." },
    ]);
  });
});
