import PageHeader from "@/features/shell/components/header/PageHeader";
import { RequestModBattlePage } from "@/features/agent-comparison/modes/request-mod/components/RequestModBattlePage";

export const metadata = { title: "Request Mod Battle | AI Matrx" };

export default function RequestModBattleRoute() {
  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 px-2">
          <span className="text-sm font-medium">Request Mod Battle</span>
        </div>
      </PageHeader>
      <RequestModBattlePage />
    </>
  );
}
