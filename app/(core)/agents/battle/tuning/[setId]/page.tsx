import { TuningBattlePage } from "@/features/agent-comparison/modes/tuning/components/TuningBattlePage";

export default async function SavedTuningBattleRoute({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  return <TuningBattlePage setId={setId} />;
}
