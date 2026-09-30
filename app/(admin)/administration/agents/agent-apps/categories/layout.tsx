import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Agent Apps" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Categories",
  title: "Agent Apps",
  letter: "CA",
});

export default function AdministrationAgentsAgentAppsCategoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
