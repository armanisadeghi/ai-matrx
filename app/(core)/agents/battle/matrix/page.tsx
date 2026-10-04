import { BattleSurfaceRuntime } from "@/features/agent-comparison/shared/BattleSurfaceRuntime";
import { MatrixBattlePage } from "@/features/agent-comparison/modes/matrix/components/MatrixBattlePage";

export default function MatrixBattleRoute() {
  return (
    <BattleSurfaceRuntime>
      <MatrixBattlePage />
    </BattleSurfaceRuntime>
  );
}
