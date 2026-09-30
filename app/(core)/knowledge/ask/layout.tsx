import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Knowledge" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/knowledge", {
  titlePrefix: "Ask",
  title: "Knowledge",
  letter: "AS",
});

export default function KnowledgeAskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
