import { getAgent } from "@/lib/agents/data";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

async function agentSubMetadata(
  id: string,
  titlePrefix: string,
  description: (name: string) => string,
  letter: string,
) {
  const agent = await getAgent(id);
  // A null read is ambiguous (denied / deleted / never existed) — the page
  // body renders the real answer via <AccessGate>; the tab title stays generic.
  if (!agent) {
    return createDynamicRouteMetadata("/agents", {
      titlePrefix,
      title: "Agent",
      letter,
    });
  }
  return createDynamicRouteMetadata("/agents", {
    titlePrefix,
    title: agent.name,
    description: description(agent.name),
    letter,
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return agentSubMetadata(
    id,
    "Run",
    (name) => `Run the ${name} AI agent.`,
    "G",
  );
}

export default function AgentRunLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
