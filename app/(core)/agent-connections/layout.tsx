import { readLayoutCookie } from "@/app/(dev)/demos/resizables/_lib/readLayoutCookie";
import { AgentConnectionsRouteShell } from "@/features/agent-connections/components/AgentConnectionsRouteShell";
import { createRouteMetadata } from "@/utils/route-metadata";

const COOKIE_NAME = "panels:agent-connections:v1";

export const metadata = createRouteMetadata("/agent-connections", {
  title: "Agent Connections",
  description:
    "Tailor how agents work in your projects — configure customizations for the entire team, or personal ones that follow you across projects.",
});

/**
 * Persistent shell for /agent-connections/*. Reads the panel-layout cookie on
 * the server so the first paint already has the user's saved sidebar width
 * baked in (no flash). Each subroute's `page.tsx` provides the right pane
 * via `children`. The sidebar component stays mounted across navigations.
 */
export default async function AgentConnectionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const defaultLayout = await readLayoutCookie(COOKIE_NAME);

  return (
    <AgentConnectionsRouteShell
      defaultLayout={defaultLayout}
      cookieName={COOKIE_NAME}
    >
      {children}
    </AgentConnectionsRouteShell>
  );
}
