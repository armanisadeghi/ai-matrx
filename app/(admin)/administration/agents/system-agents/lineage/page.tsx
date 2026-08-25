import { AgentLineageTree } from "@/features/agents/components/agent-listings/AgentLineageTree";

export const metadata = { title: "Agent Lineage | System Agents" };

export default function AdminSystemAgentsLineagePage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-4 max-w-[1400px]">
          <AgentLineageTree />
        </div>
      </div>
    </div>
  );
}
