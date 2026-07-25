import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/marketing/content-plan", {
  title: "Content Plan",
  description:
    "Plan every URL a site should have — pillars, clusters, briefs, keywords, and the people behind them.",
  letter: "CP",
  additionalMetadata: {
    keywords: ["content plan", "seo", "pillars", "clusters", "site planning"],
  },
});

export default function ContentPlanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
