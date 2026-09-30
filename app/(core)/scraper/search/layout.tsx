import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Webscraper" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/scraper", {
  titlePrefix: "Search",
  title: "Webscraper",
  letter: "SE",
});

export default function ScraperSearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
