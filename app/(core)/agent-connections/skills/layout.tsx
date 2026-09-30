import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Agent Connections" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/agent-connections", {
  titlePrefix: "Skills",
  title: "Agent Connections",
  letter: "SK",
});

export default function AgentConnectionsSkillsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
