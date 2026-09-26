import { BattleSurfaceRuntime } from "@/features/agent-comparison/shared/BattleSurfaceRuntime";
import { ToolsBattlePage } from "@/features/agent-comparison/modes/tools/components/ToolsBattlePage";

export default async function SavedToolsBattleRoute({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  return (
    <BattleSurfaceRuntime>
      <ToolsBattlePage setId={setId} />
    </BattleSurfaceRuntime>
  );
}
