import { AgentSlotsConsole } from "@/features/admin/agent-slots/AgentSlotsConsole";

export const metadata = {
  title: "Agent Slots",
  description: "DB-managed system-agent pins and overrides",
};

export default function AgentSlotsPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)]">
      <AgentSlotsConsole />
    </div>
  );
}
