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
      titlePrefix: "Apps",
      letter: "AP",
      title: "Agent",
    });
  }
  return createDynamicRouteMetadata("/agents", {
    titlePrefix: "Apps",
    title: agent.name,
    description: `Agent apps connected to ${agent.name}.`,
    letter: "AP",
  });
}

export default function AgentAppsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
