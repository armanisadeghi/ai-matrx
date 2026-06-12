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
    titlePrefix: "Versions",
    title: agent.name,
    description: `Version history for ${agent.name}.`,
    letter: "AV",
  });
}

export default function AgentVersionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
