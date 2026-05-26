import { getAgentApp } from "@/lib/agent-apps/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentAppHeader } from "@/features/agent-apps/components/route-header/AgentAppHeader";
import { AgentAppEditPageClient } from "./AgentAppEditPageClient";

export const metadata = { title: "Code" };

interface CodePageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentAppCodePage({ params }: CodePageProps) {
  const { id } = await params;
  const app = await getAgentApp(id);

  return (
    <>
      {/* <PageHeader>
        <AgentAppHeader appId={app.id} appName={app.name} active="code" />
      </PageHeader> */}
      <AgentAppEditPageClient app={app} />
    </>
  );
}
