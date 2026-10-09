import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Applets" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Analytics",
  title: "Applets",
  letter: "AN",
});

export default function AdministrationAgentsAppletsAnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
