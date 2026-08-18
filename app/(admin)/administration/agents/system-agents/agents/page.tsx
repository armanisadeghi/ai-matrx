import { getSystemAgentListSeed } from "@/lib/agents/data";
import { AgentListHydrator } from "@/features/agents/route/AgentListHydrator";
import { SystemAgentsGrid } from "@/features/agents/components/agent-listings/SystemAgentsGrid";

export const metadata = { title: "System Agents | Admin" };

export default async function AdminSystemAgentsListPage() {
  const seeds = await getSystemAgentListSeed();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
        <h1 className="text-lg font-semibold text-foreground">System Agents</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Global (builtin) agents available to every user. Edit, run, or create
          new ones — changes apply platform-wide.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <AgentListHydrator seeds={seeds} />
        <div className="container mx-auto px-4 py-4 max-w-[1800px]">
          <SystemAgentsGrid />
        </div>
      </div>
    </div>
  );
}
