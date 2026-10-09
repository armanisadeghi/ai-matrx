import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Applets" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "All Applets",
  title: "Applets",
  letter: "AS",
});

export default function AdministrationAgentsAppletsAppsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
