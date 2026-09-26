import { BattlePage } from "@/features/agent-comparison/components/BattlePage";

export default async function SavedAgentComparisonRoute({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  return <BattlePage setId={setId} />;
}
