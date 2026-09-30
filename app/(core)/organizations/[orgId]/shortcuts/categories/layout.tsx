import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Shortcuts" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/organizations", {
  titlePrefix: "Categories",
  title: "Shortcuts",
  letter: "CA",
});

export default function OrganizationsOrgIdShortcutsCategoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
