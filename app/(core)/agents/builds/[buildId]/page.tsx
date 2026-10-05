import { AgentBuildPage } from "@/features/agents/factory/components/AgentBuildPage";

export const metadata = {
  title: "Agent build | AI Matrx",
  description: "Your agent build, step by step",
};

/** /agents/builds/[buildId] — one of the person's own Agent Factory builds. */
export default async function AgentBuildRoute({ params }: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await params;
  return <AgentBuildPage buildId={buildId} />;
}
