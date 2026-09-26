import { BattleSurfaceRuntime } from "@/features/agent-comparison/shared/BattleSurfaceRuntime";
import { RequestModBattlePage } from "@/features/agent-comparison/modes/request-mod/components/RequestModBattlePage";

export default function RequestModBattleRoute() {
  return (
    <BattleSurfaceRuntime>
      <RequestModBattlePage />
    </BattleSurfaceRuntime>
  );
}
