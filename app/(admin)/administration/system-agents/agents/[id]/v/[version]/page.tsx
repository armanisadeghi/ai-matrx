import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents/data";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentVersionDiffPage } from "@/features/agents/components/diff/AgentVersionDiffPage";

const ADMIN_BASE_PATH = "/administration/system-agents/agents";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; version: string }>;
}) {
  const { version } = await params;
  const versionNum = parseInt(version, 10);
  if (isNaN(versionNum)) return { title: "Not Found" };
  return { title: `v${versionNum} | System Agents` };
}

export default async function AdminSystemAgentVersionPage({
  params,
}: {
  params: Promise<{ id: string; version: string }>;
}) {
  const { id, version } = await params;
  const versionNum = parseInt(version, 10);
  if (isNaN(versionNum)) notFound();

  const agent = await getAgent(id);

  return (
    <>
      <PageHeader>
        <AgentHeader
          agentId={id}
          agentName={agent.name}
          backHref={ADMIN_BASE_PATH}
          basePath={ADMIN_BASE_PATH}
        />
      </PageHeader>
      <div className="h-full overflow-hidden">
        <AgentVersionDiffPage agentId={id} initialVersion={versionNum} />
      </div>
    </>
  );
}
