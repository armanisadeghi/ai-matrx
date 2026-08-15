import { getAgentApp } from "@/lib/agent-apps/data";
import { AgentAppHeader } from "@/features/agent-apps/components/route-header/AgentAppHeader";
import { AgentAppRunWithHistory } from "@/features/agent-apps/components/run/AgentAppRunWithHistory";

interface RunPageProps {
  params: Promise<{ id: string }>;
}

/**
 * /agent-apps/[id]/run — runs the user's actual app inside the management
 * shell. Same renderer as `/p/[slug]`, framed by the sub-route header so
 * the user can flip back to Code or Settings without leaving the admin UI.
 *
 * Run history opens from the route header in the canonical Agent Run History
 * window, so it remains available without adding an orphaned body control.
 */
export default async function AgentAppRunPage({ params }: RunPageProps) {
  const { id } = await params;
  const app = await getAgentApp(id);

  return (
    <>
      <AgentAppHeader
        appId={app.id}
        appName={app.name}
        agentId={app.agent_id}
        initialStatus={app.status}
        initialVisibility={app.visibility}
        active="run"
      />
      <AgentAppRunWithHistory app={app} slug={app.slug} />
    </>
  );
}
