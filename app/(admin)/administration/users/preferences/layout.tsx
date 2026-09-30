import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Users & Access" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Preferences",
  title: "Users & Access",
  letter: "PE",
});

export default function AdministrationUsersPreferencesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
