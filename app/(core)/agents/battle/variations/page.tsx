import { BattleSurfaceRuntime } from "@/features/agent-comparison/shared/BattleSurfaceRuntime";
import { VariationsBattlePage } from "@/features/agent-comparison/modes/variations/components/VariationsBattlePage";

export default function VariationsBattleRoute() {
  return (
    <BattleSurfaceRuntime>
      <VariationsBattlePage />
    </BattleSurfaceRuntime>
  );
}
