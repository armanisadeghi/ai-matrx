import PageHeader from "@/features/shell/components/header/PageHeader";
import { ModelBattlePage } from "@/features/agent-comparison/modes/model/components/ModelBattlePage";

export const metadata = { title: "Model Battle | AI Matrx" };

export default function ModelBattleRoute() {
  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 px-2">
          <span className="text-sm font-medium">Model Battle</span>
        </div>
      </PageHeader>
      <ModelBattlePage />
    </>
  );
}
