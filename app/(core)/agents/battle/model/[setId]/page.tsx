import { ModelBattlePage } from "@/features/agent-comparison/modes/model/components/ModelBattlePage";

export default async function SavedModelBattleRoute({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  return <ModelBattlePage setId={setId} />;
}
