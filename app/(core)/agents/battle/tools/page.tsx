import { BattleSurfaceRuntime } from "@/features/agent-comparison/shared/BattleSurfaceRuntime";
import { ToolsBattlePage } from "@/features/agent-comparison/modes/tools/components/ToolsBattlePage";

export default function ToolsBattleRoute() {
  return (
    <BattleSurfaceRuntime>
      <ToolsBattlePage />
    </BattleSurfaceRuntime>
  );
}
