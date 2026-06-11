import PageHeader from "@/features/shell/components/header/PageHeader";
import { VariationsBattlePage } from "@/features/agent-comparison/modes/variations/components/VariationsBattlePage";


export default function VariationsBattleRoute() {
  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 px-2">
          <span className="text-sm font-medium">Agent Variations Battle</span>
        </div>
      </PageHeader>
      <VariationsBattlePage />
    </>
  );
}
