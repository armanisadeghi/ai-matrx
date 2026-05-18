import PageHeader from "@/features/shell/components/header/PageHeader";
import { BattlePage } from "@/features/agent-battle/components/BattlePage";

export const metadata = { title: "Agent Battle | AI Matrx" };

export default function AgentBattleRoute() {
  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 px-2">
          <span className="text-sm font-medium">Agent Battle</span>
        </div>
      </PageHeader>
      <BattlePage />
    </>
  );
}
