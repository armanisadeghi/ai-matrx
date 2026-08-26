import { getAgent } from "@/lib/agents/data";
import { AgentSamplesManager } from "@/features/agents/components/samples/AgentSamplesManager";
import { AgentHeader } from "@/features/agents/components/shared/AgentHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";

export const metadata = { title: "Agent Test Cases | Admin" };

const ADMIN_BASE_PATH = "/administration/agents/system-agents/agents";

export default async function AdminSystemAgentSamplesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 p-4">
          <div>
            <h1 className="text-lg font-semibold">Test cases</h1>
            <p className="text-sm text-muted-foreground">
              Sample inputs for {agent.name} — approved samples appear as
              one-click chips in the builder and runner; candidates come from
              real runs and manual saves.
            </p>
          </div>
          <AgentSamplesManager agentId={id} />
        </div>
      </div>
    </>
  );
}
