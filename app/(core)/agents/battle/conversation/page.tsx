import { BattleSurfaceRuntime } from "@/features/agent-comparison/shared/BattleSurfaceRuntime";
import { ConversationBattlePage } from "@/features/agent-comparison/modes/conversation/components/ConversationBattlePage";

export default function ConversationBattleRoute() {
  return (
    <BattleSurfaceRuntime>
      <ConversationBattlePage />
    </BattleSurfaceRuntime>
  );
}
