import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "System Agents" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Applets",
  title: "System Agents",
  letter: "AB",
});

export default function AdministrationAgentsSystemAgentsAppsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
