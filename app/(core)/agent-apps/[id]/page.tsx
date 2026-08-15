import { getAgentApp } from "@/lib/agent-apps/data";
import { AgentAppOverviewContent } from "@/features/agent-apps/route/AgentAppOverviewContent";
import { AgentAppHeader } from "@/features/agent-apps/components/route-header/AgentAppHeader";

interface AgentAppPageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentAppOverviewPage({
  params,
}: AgentAppPageProps) {
  const { id } = await params;
  // Trigger the data fetch (and notFound on miss). The layout's hydrator
  // owns Redux seeding; this server fetch primarily exists so 404s render
  // as the route's not-found.tsx instead of an empty Redux state.
  const app = await getAgentApp(id);

  return (
    <>
      <AgentAppHeader
        appId={app.id}
        appName={app.name}
        agentId={app.agent_id}
        initialStatus={app.status}
        initialVisibility={app.visibility}
        active="overview"
      />
      <AgentAppOverviewContent appId={app.id} />
    </>
  );
}
