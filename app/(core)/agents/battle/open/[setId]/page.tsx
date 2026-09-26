import { BattleSurfaceRuntime } from "@/features/agent-comparison/shared/BattleSurfaceRuntime";
import { BattlePage } from "@/features/agent-comparison/components/BattlePage";

export default async function SavedAgentComparisonRoute({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  return (
    <BattleSurfaceRuntime>
      <BattlePage setId={setId} />
    </BattleSurfaceRuntime>
  );
}
