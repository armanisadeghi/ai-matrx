import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/scraper/test-new", {
  title: "Scraper Test New",
  description: "Interactive demo: Scraper Test New. AI Matrx demo route.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
