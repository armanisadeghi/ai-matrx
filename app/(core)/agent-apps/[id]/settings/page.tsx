import { getAgentApp } from "@/lib/agent-apps/data";
import { AgentAppHeader } from "@/features/agent-apps/components/route-header/AgentAppHeader";
import { AgentAppSettingsContent } from "@/features/agent-apps/route/AgentAppSettingsContent";

interface SettingsPageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentAppSettingsPage({
  params,
}: SettingsPageProps) {
  const { id } = await params;
  const app = await getAgentApp(id);

  return (
    <>
      <AgentAppHeader
        appId={app.id}
        appName={app.name}
        agentId={app.agent_id}
        initialStatus={app.status}
        initialVisibility={app.visibility}
        active="settings"
      />
      <AgentAppSettingsContent appId={app.id} />
    </>
  );
}
