import { ToolsBattlePage } from "@/features/agent-comparison/modes/tools/components/ToolsBattlePage";

export default async function SavedToolsBattleRoute({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  return <ToolsBattlePage setId={setId} />;
}
