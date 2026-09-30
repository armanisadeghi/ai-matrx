import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Settings" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/settings", {
  titlePrefix: "Organizations",
  title: "Settings",
  letter: "OR",
});

export default function SettingsOrganizationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
