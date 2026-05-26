import { getAgentApp, getAgentAppVersions } from "@/lib/agent-apps/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentAppHeader } from "@/features/agent-apps/components/route-header/AgentAppHeader";
import { AgentAppVersionsContent } from "@/features/agent-apps/route/AgentAppVersionsContent";

export const metadata = { title: "Versions" };

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
      <PageHeader>
        <AgentAppHeader appId={app.id} appName={app.name} active="versions" />
      </PageHeader>
      <AgentAppVersionsContent
        appId={app.id}
        versions={versions}
        currentVersion={app.version}
      />
    </>
  );
}
