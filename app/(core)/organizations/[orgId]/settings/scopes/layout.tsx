import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Settings" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/organizations", {
  titlePrefix: "Scopes",
  title: "Settings",
  letter: "SC",
});

export default function OrganizationsOrgIdSettingsScopesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
