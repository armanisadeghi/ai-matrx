import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents/data";
import { AgentVersionDiffPage } from "@/features/agents/components/diff/AgentVersionDiffPage";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; version: string }>;
}) {
  const { version } = await params;
  const versionNum = parseInt(version, 10);
  if (isNaN(versionNum)) return { title: "Not Found" };
  return { title: `v${versionNum}` };
}

export default async function AgentVersionPage({
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
        <AgentHeader agentId={id} agentName={agent.name} />
      </PageHeader>
      <AgentVersionDiffPage agentId={id} initialVersion={versionNum} />
    </>
  );
}
