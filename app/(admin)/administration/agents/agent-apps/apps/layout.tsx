import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Agent Apps" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Apps",
  title: "Agent Apps",
  letter: "AS",
});

export default function AdministrationAgentsAgentAppsAppsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
