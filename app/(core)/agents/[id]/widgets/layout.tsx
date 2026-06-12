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
    titlePrefix: "Widgets",
    title: agent.name,
    description: `Embeddable widgets for ${agent.name}.`,
    letter: "AW",
  });
}

export default function AgentWidgetsSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
