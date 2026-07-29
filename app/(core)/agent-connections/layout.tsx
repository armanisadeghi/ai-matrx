import { readLayoutCookie } from "@/features/resizable-panels/readLayoutCookie";
import { AgentConnectionsRouteShell } from "@/features/agent-connections/components/AgentConnectionsRouteShell";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
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
  // Server-side guest branch (module-landing-pages doctrine): the workspace is
  // an authed, Redux-backed client tree — never render it for anonymous
  // visitors. No marketing landing exists yet, so guests get the shared gate.
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Agent Connections"
        route="/agent-connections"
        description="Tailor how agents work in your projects — team-wide customizations, or personal ones that follow you everywhere."
      />
    );
  }

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
