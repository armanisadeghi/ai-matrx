import { getAgentApp } from "@/lib/agent-apps/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentAppHeader } from "@/features/agent-apps/components/route-header/AgentAppHeader";
import { AgentAppRenderer } from "@/features/agent-apps/components/AgentAppRenderer";

export const metadata = { title: "Run" };

interface RunPageProps {
  params: Promise<{ id: string }>;
}

/**
 * /agent-apps/[id]/run — runs the user's actual app inside the management
 * shell. Same renderer as `/p/[slug]`, framed by the sub-route header so
 * the user can flip back to Code or Settings without leaving the admin UI.
 *
 * "Preview" (the name of an earlier draft of this route) is reserved for a
 * future small inline render — see Phase 1d in the plan. This page is the
 * full-screen execution; the renderer dispatches the standard
 * `launchAgentExecution` path so runs here count the same as runs on the
 * public URL.
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
        <AgentAppRenderer app={app} slug={app.slug} />
      </div>
    </>
  );
}
