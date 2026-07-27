import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/scraper/quick-scrape", {
  title: "Scraper Quick Scrape",
  description: "Interactive demo: Scraper Quick Scrape. AI Matrx demo route.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
