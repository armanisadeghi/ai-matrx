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
  return createDynamicRouteMetadata("/agents", {
    title: agent.name,
    description:
      agent.description || `Configure and run the ${agent.name} AI agent`,
  });
}

export default async function AgentDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      {/* Hydrates Redux store. Runs after paint so layout never blocks on it. */}
      <AgentHydratorServer agentId={id} />
      <div className="h-full overflow-hidden">{children}</div>
    </>
  );
}
