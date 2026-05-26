import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/scraper/search-and-scrape", {
  title: "Scraper Search And Scrape",
  description: "Interactive demo: Scraper Search And Scrape. AI Matrx demo route.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
