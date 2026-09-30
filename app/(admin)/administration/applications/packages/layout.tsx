import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Applications" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Packages",
  title: "Applications",
  letter: "PA",
});

export default function AdministrationApplicationsPackagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
