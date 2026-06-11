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
    titlePrefix: "Shortcuts",
    title: agent.name,
    description: `Shortcuts for ${agent.name}.`,
    letter: "AS",
  });
}

export default function AgentShortcutsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
