import { AgentRunnerPage } from "@/features/agents/components/run/AgentRunnerPage";

export const metadata = { title: "System Agent Runner | Admin" };

const ADMIN_BASE_PATH = "/administration/system-agents/agents";

export default async function AdminSystemAgentRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AgentRunnerPage
      agentId={id}
      backHref={ADMIN_BASE_PATH}
      basePath={ADMIN_BASE_PATH}
    />
  );
}
