import { SystemPromptBattlePage } from "@/features/agent-comparison/modes/system-prompt/components/SystemPromptBattlePage";

export default async function SavedSystemPromptBattleRoute({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  return <SystemPromptBattlePage setId={setId} />;
}
