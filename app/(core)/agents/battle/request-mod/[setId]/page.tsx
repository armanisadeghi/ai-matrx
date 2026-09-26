import { BattleSurfaceRuntime } from "@/features/agent-comparison/shared/BattleSurfaceRuntime";
import { RequestModBattlePage } from "@/features/agent-comparison/modes/request-mod/components/RequestModBattlePage";

export default async function SavedRequestModBattleRoute({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  return (
    <BattleSurfaceRuntime>
      <RequestModBattlePage setId={setId} />
    </BattleSurfaceRuntime>
  );
}
