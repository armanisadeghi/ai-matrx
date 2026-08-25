import { AgentLineageTree } from "@/features/agents/components/agent-listings/AgentLineageTree";

export const metadata = { title: "Agent Lineage | System Agents" };

export default function AdminSystemAgentsLineagePage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
        <h1 className="text-lg font-semibold text-foreground">Agent Lineage</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          See what each system agent gives rise to — derived agents,
          shortcuts, and apps. Expand a row to drill into the actual references.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-4 max-w-[1400px]">
          <AgentLineageTree />
        </div>
      </div>
    </div>
  );
}
