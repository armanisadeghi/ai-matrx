import { getSystemAgentListSeed } from "@/lib/agents/data";
import { AgentListHydrator } from "@/features/agents/route/AgentListHydrator";
import { SystemAgentsGrid } from "@/features/agents/components/agent-listings/SystemAgentsGrid";

export const metadata = { title: "System Agents | Admin" };

export default async function AdminSystemAgentsListPage() {
  const seeds = await getSystemAgentListSeed();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <AgentListHydrator seeds={seeds} />
        <div className="container mx-auto px-4 py-4 max-w-[1800px]">
          <SystemAgentsGrid />
        </div>
      </div>
    </div>
  );
}
