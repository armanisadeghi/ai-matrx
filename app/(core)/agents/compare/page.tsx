import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentComparisonPage } from "@/features/agents/components/diff/AgentComparisonPage";

export const metadata = { title: "Compare Agents | AI Matrx" };

export default function CompareAgentsPage() {
  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 px-2">
          <span className="text-sm font-medium">Compare Agents</span>
        </div>
      </PageHeader>
      <AgentComparisonPage />
    </>
  );
}
