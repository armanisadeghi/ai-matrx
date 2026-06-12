import PageHeader from "@/features/shell/components/header/PageHeader";
import { SystemPromptBattlePage } from "@/features/agent-comparison/modes/system-prompt/components/SystemPromptBattlePage";


export default function SystemPromptBattleRoute() {
  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 px-2">
          <span className="text-sm font-medium">System Prompt Battle</span>
        </div>
      </PageHeader>
      <SystemPromptBattlePage />
    </>
  );
}
