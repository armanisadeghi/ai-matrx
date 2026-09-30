import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Agent Skills" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Categories",
  title: "Agent Skills",
  letter: "CE",
});

export default function AdministrationAgentsSkillsCategoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
