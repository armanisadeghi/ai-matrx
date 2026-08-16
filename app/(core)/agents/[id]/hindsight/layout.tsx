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
    titlePrefix: "Review",
    title: agent.name,
    description: `Continuous review for ${agent.name} — proposals from its real conversations.`,
    letter: "AG",
  });
}

export default function AgentHindsightLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
