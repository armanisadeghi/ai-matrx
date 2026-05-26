import { getAgent } from "@/lib/agents/data";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { AgentHydratorServer } from "@/features/agents/route/AgentHydratorServer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);
  return createDynamicRouteMetadata("/administration/system-agents/agents", {
    title: `${agent.name} (System)`,
    description:
      agent.description ||
      `Administer the ${agent.name} system agent.`,
  });
}

export default async function AdminSystemAgentDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <AgentHydratorServer agentId={id} />
      <div className="h-full overflow-hidden">{children}</div>
    </>
  );
}
