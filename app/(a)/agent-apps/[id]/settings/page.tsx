import { getAgentApp } from "@/lib/agent-apps/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentAppHeader } from "@/features/agent-apps/components/route-header/AgentAppHeader";
import { AgentAppSettingsContent } from "@/features/agent-apps/route/AgentAppSettingsContent";

export const metadata = { title: "Settings" };

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
      <PageHeader>
        <AgentAppHeader appId={app.id} appName={app.name} active="settings" />
      </PageHeader>
      <AgentAppSettingsContent appId={app.id} />
    </>
  );
}
