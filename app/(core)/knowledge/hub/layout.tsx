import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Knowledge" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/knowledge", {
  titlePrefix: "Knowledge Hub",
  title: "Knowledge",
  letter: "KH",
});

export default function KnowledgeHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
