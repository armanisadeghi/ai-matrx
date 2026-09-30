import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Knowledge" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Growth Loop",
  title: "Knowledge",
  letter: "GL",
});

export default function AdministrationKnowledgeGrowthLoopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
