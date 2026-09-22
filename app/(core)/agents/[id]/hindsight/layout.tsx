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
      titlePrefix: "Review",
      letter: "AH",
      title: "Agent",
    });
  }
  return createDynamicRouteMetadata("/agents", {
    titlePrefix: "Review",
    title: agent.name,
    description: `Continuous review for ${agent.name} — proposals from its real conversations.`,
    letter: "AH",
  });
}

export default function AgentHindsightLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
