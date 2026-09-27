/**
 * The scraper streams `structured_data` as a LIST (JSON-LD blocks; `[]` for a
 * page with none) as well as the older object shapes. The result screen's
 * processor used to read only `structured_data["Ordered Lists"]`, so every
 * list — and every object without that key — reached the Structured tab as
 * `{}` ("No structured data available") although the page had data.
 */
import ScraperDataUtils from "@/features/scraper/utils/data-utils";
import type { ScrapedResult } from "@/features/scraper/types/scraper-api";

function structuredOf(structured_data: ScrapedResult["structured_data"]) {
  const envelope = { type: "fetch_results", results: [{ url: "https://a.example.test", structured_data }] };
  return ScraperDataUtils.processFullData(envelope).results[0].structured_data;
}

describe("structured_data reaches the Structured tab in every shape the scraper sends", () => {
  it("a JSON-LD list is kept", () => {
    const blocks = [{ "@type": "Article", headline: "Tomatoes" }];
    expect(structuredOf(blocks)).toEqual(blocks);
  });
  it("an empty list stays empty (the tab says there is none)", () => {
    expect(structuredOf([])).toEqual([]);
  });
  it("an object without the legacy key is kept whole", () => {
    expect(structuredOf({ ld_json: [{ "@type": "Recipe" }] })).toEqual({ ld_json: [{ "@type": "Recipe" }] });
  });
  it("the legacy Ordered Lists object still unwraps", () => {
    expect(structuredOf({ "Ordered Lists": [["a", "b"]] })).toEqual([["a", "b"]]);
  });
  it("nothing at all is an empty object", () => {
    expect(structuredOf(undefined)).toEqual({});
  });
});

/**
 * Same drift for `organized_data`: the scraper streams it as a LIST of typed
 * items. `useScraperApi` wraps a list as `{ sections }` for the live screen,
 * but a stored result goes straight to `processFullData`, which turned the list
 * into `{"0": …, "1": …}` — the Content tab read "No organized content
 * available" on a saved page the live screen showed in full (2026-09-27).
 */
import { processOrganizedData } from "@/features/scraper/utils/scraper-utils";

describe("organized_data reaches the Content tab as a list or an object", () => {
  const items = [
    { type: "header", level: 1, content: "Chlorophyll" },
    { type: "text", content: "Chlorophyll is green." },
  ];
  function organizedOf(organized_data: unknown) {
    const envelope = { type: "fetch_results", results: [{ url: "https://a.example.test", organized_data }] };
    return processOrganizedData(ScraperDataUtils.processFullData(envelope).results[0].organized_data);
  }
  it("a streamed list renders its sections", () => {
    expect(organizedOf(items).map((s: { heading: { text: string } }) => s.heading.text)).toEqual(["Chlorophyll"]);
  });
  it("the wrapped { sections } object still renders", () => {
    expect(organizedOf({ sections: items })).toHaveLength(1);
  });
});
