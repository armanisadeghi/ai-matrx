import { FactoryBuildPage } from "@/features/agents/factory/components/FactoryBuildPage";

export const metadata = {
  title: "Agent Factory build | Admin",
  description: "One Agent Factory build, step by step",
};

/** /administration/agents/factory/[buildId] — one build as a vertical run. */
export default async function AgentFactoryBuildRoute({
  params,
}: {
  params: Promise<{ buildId: string }>;
}) {
  const { buildId } = await params;
  return <FactoryBuildPage buildId={buildId} />;
}
