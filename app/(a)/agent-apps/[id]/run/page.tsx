import { getAgentApp } from "@/lib/agent-apps/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentAppHeader } from "@/features/agent-apps/components/route-header/AgentAppHeader";
import { AgentAppRunWithHistory } from "@/features/agent-apps/components/run/AgentAppRunWithHistory";

export const metadata = { title: "Run" };

interface RunPageProps {
  params: Promise<{ id: string }>;
}

/**
 * /agent-apps/[id]/run — runs the user's actual app inside the management
 * shell. Same renderer as `/p/[slug]`, framed by the sub-route header so
 * the user can flip back to Code or Settings without leaving the admin UI.
 *
 * The history sidebar (Phase 1g) sits next to the renderer so users can
 * jump between past runs without leaving the page; click → loadConversation
 * rehydrates the focused conversation, the active shell picks it up, and
 * subsequent submissions continue the same conversation.
 */
export default async function AgentAppRunPage({ params }: RunPageProps) {
  const { id } = await params;
  const app = await getAgentApp(id);

  return (
    <>
      <PageHeader>
        <AgentAppHeader appId={app.id} appName={app.name} active="run" />
      </PageHeader>
      <div
        className="h-full overflow-hidden"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <AgentAppRunWithHistory app={app} slug={app.slug} />
      </div>
    </>
  );
}
