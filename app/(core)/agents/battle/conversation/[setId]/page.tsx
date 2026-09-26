import { BattleSurfaceRuntime } from "@/features/agent-comparison/shared/BattleSurfaceRuntime";
import { ConversationBattlePage } from "@/features/agent-comparison/modes/conversation/components/ConversationBattlePage";

export default async function SavedConversationBattleRoute({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  return (
    <BattleSurfaceRuntime>
      <ConversationBattlePage setId={setId} />
    </BattleSurfaceRuntime>
  );
}
