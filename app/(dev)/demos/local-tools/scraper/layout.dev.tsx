import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/local-tools/scraper", {
  title: "Local Tools Scraper",
  description: "Interactive demo: Local Tools Scraper. AI Matrx demo route.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
