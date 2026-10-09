import { getAgent } from "@/lib/agents/data";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);
  // A null read is ambiguous (denied / deleted / never existed) — the body
  // renders the real answer via <AccessGate>; the tab title stays generic.
  if (!agent) {
    return createDynamicRouteMetadata("/agents", {
      titlePrefix: "Runs",
      letter: "RU",
      title: "Agent",
    });
  }
  return createDynamicRouteMetadata("/agents", {
    titlePrefix: "Runs",
    title: agent.name,
    description: `Runs of ${agent.name}.`,
    letter: "RU",
  });
}

export default function AgentRunsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
