import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents/data";
import { AgentVersionDiffPage } from "@/features/agents/components/diff/AgentVersionDiffPage";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; version: string }>;
}) {
  const { version } = await params;
  const versionNum = parseInt(version, 10);
  if (isNaN(versionNum)) return { title: "Agent version" };
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

  // A null read is ambiguous under RLS (denied / deleted / never existed /
  // session expired) — the gate asks the platform which one it actually is
  // instead of a generic 404.
  if (!agent) {
    return (
      <AccessGate
        token="agent"
        id={id}
        fallbackHref="/agents"
        fallbackLabel="All agents"
      />
    );
  }

  return (
    <>
      <PageHeader>
        <AgentHeader agentId={id} agentName={agent.name} />
      </PageHeader>
      <AgentVersionDiffPage agentId={id} initialVersion={versionNum} />
    </>
  );
}
