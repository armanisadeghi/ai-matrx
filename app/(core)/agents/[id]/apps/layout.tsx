import { getAgent } from "@/lib/agents/data";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);
  return createDynamicRouteMetadata("/agents", {
    titlePrefix: "Apps",
    title: agent.name,
    description: `Agent apps connected to ${agent.name}.`,
    letter: "G",
  });
}

export default function AgentAppsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
