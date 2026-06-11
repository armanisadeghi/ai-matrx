import PageHeader from "@/features/shell/components/header/PageHeader";
import { ToolsBattlePage } from "@/features/agent-comparison/modes/tools/components/ToolsBattlePage";


export default function ToolsBattleRoute() {
  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 px-2">
          <span className="text-sm font-medium">Tools Battle</span>
        </div>
      </PageHeader>
      <ToolsBattlePage />
    </>
  );
}
