import { VariationsBattlePage } from "@/features/agent-comparison/modes/variations/components/VariationsBattlePage";

export default async function SavedVariationsBattleRoute({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  return <VariationsBattlePage setId={setId} />;
}
