import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/marketing", {
  title: "Marketing",
  description:
    "Manage websites, canonical pages, crawl sessions, and marketing analysis.",
  letter: "Mk",
});

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
