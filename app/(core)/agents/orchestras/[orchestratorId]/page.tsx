import type { Metadata } from "next";
import { SetBuilder } from "@/features/agents/agent-sets/components/SetBuilder";

export const metadata: Metadata = {
  title: "Set Builder",
};

export default async function AgentSetBuilderPage({
  params,
}: {
  params: Promise<{ orchestratorId: string }>;
}) {
  const { orchestratorId } = await params;
  return <SetBuilder orchestratorId={orchestratorId} />;
}
