import { BattleSurfaceRuntime } from "@/features/agent-comparison/shared/BattleSurfaceRuntime";
import { BattlePage } from "@/features/agent-comparison/components/BattlePage";

export default function AgentComparisonRoute() {
  return (
    <BattleSurfaceRuntime>
      <BattlePage />
    </BattleSurfaceRuntime>
  );
}
