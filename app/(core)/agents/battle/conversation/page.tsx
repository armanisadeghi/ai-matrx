import PageHeader from "@/features/shell/components/header/PageHeader";
import { ConversationBattlePage } from "@/features/agent-comparison/modes/conversation/components/ConversationBattlePage";

export default function ConversationBattleRoute() {
  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 px-2">
          <span className="text-sm font-medium">Conversation Battle</span>
        </div>
      </PageHeader>
      <ConversationBattlePage />
    </>
  );
}
