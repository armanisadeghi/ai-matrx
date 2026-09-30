import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Webscraper" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/scraper", {
  titlePrefix: "Search & Scrape",
  title: "Webscraper",
  letter: "SS",
});

export default function ScraperSearchAndScrapeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
