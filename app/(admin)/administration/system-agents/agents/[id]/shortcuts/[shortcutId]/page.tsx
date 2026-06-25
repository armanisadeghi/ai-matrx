import { getAgent } from "@/lib/agents/data";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentShortcutEditor } from "@/features/agents/components/shortcuts/AgentShortcutEditor";

export const metadata = { title: "Edit Shortcut | System Agents" };

const ADMIN_BASE_PATH = "/administration/system-agents/agents";

export default async function AdminSystemAgentEditShortcutPage({
  params,
}: {
  params: Promise<{ id: string; shortcutId: string }>;
}) {
  const { id, shortcutId } = await params;
  const agent = await getAgent(id);

  return (
    <>
      <PageHeader>
        <AgentHeader
          agentId={id}
          agentName={agent.name}
          backHref={ADMIN_BASE_PATH}
          basePath={ADMIN_BASE_PATH}
        />
      </PageHeader>
      <div className="h-full overflow-hidden">
        <AgentShortcutEditor
          agentId={id}
          agentName={agent.name}
          shortcutId={shortcutId}
          basePath={ADMIN_BASE_PATH}
        />
      </div>
    </>
  );
}
