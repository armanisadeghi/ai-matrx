import { BattleSurfaceRuntime } from "@/features/agent-comparison/shared/BattleSurfaceRuntime";
import { SystemPromptBattlePage } from "@/features/agent-comparison/modes/system-prompt/components/SystemPromptBattlePage";

export default function SystemPromptBattleRoute() {
  return (
    <BattleSurfaceRuntime>
      <SystemPromptBattlePage />
    </BattleSurfaceRuntime>
  );
}
