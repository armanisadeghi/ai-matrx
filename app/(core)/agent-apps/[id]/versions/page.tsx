import { getAgentApp, getAgentAppVersions } from "@/lib/agent-apps/data";
import { AgentAppHeader } from "@/features/agent-apps/components/route-header/AgentAppHeader";
import { AgentAppVersionsContent } from "@/features/agent-apps/route/AgentAppVersionsContent";

interface VersionsPageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentAppVersionsPage({
  params,
}: VersionsPageProps) {
  const { id } = await params;
  const app = await getAgentApp(id);
  const versions = await getAgentAppVersions(app.id);

  return (
    <>
      <AgentAppHeader
        appId={app.id}
        appName={app.name}
        agentId={app.agent_id}
        initialStatus={app.status}
        initialVisibility={app.visibility}
        active="versions"
      />
      <AgentAppVersionsContent
        appId={app.id}
        versions={versions}
        currentVersion={app.version}
      />
    </>
  );
}
