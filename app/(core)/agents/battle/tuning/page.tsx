import PageHeader from "@/features/shell/components/header/PageHeader";
import { TuningBattlePage } from "@/features/agent-comparison/modes/tuning/components/TuningBattlePage";


export default function TuningBattleRoute() {
  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 px-2">
          <span className="text-sm font-medium">Tuning Battle</span>
        </div>
      </PageHeader>
      <TuningBattlePage />
    </>
  );
}
