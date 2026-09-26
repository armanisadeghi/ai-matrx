import { BattleSurfaceRuntime } from "@/features/agent-comparison/shared/BattleSurfaceRuntime";
import { TuningBattlePage } from "@/features/agent-comparison/modes/tuning/components/TuningBattlePage";

export default function TuningBattleRoute() {
  return (
    <BattleSurfaceRuntime>
      <TuningBattlePage />
    </BattleSurfaceRuntime>
  );
}
