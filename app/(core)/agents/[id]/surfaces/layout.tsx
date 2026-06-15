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
    titlePrefix: "Surfaces",
    title: agent.name,
    description: `UI surfaces for ${agent.name}.`,
    letter: "G",
  });
}

export default function AgentSurfacesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
