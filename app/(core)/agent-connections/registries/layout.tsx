import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Agent Connections" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/agent-connections", {
  titlePrefix: "Registries",
  title: "Agent Connections",
  letter: "RE",
});

export default function AgentConnectionsRegistriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
