import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Knowledge" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/knowledge", {
  titlePrefix: "About",
  title: "Knowledge",
  letter: "AB",
});

export default function KnowledgeAboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
