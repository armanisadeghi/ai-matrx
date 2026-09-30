import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Settings" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/organizations", {
  titlePrefix: "Change Policy",
  title: "Settings",
  letter: "CP",
});

export default function OrganizationsOrgIdSettingsChangePolicyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
