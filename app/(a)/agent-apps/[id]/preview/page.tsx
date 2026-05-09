import { getAgentApp } from "@/lib/agent-apps/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentAppHeader } from "@/features/agent-apps/components/route-header/AgentAppHeader";
import { AgentAppRenderer } from "@/features/agent-apps/components/AgentAppRenderer";

export const metadata = { title: "Preview" };

interface PreviewPageProps {
  params: Promise<{ id: string }>;
}

/**
 * /agent-apps/[id]/preview — runs the user's actual app inside the
 * management shell. Same renderer as `/p/[slug]`, but framed by the
 * sub-route header so the user can flip back to Code or Settings without
 * leaving the admin UI.
 *
 * The runner already authenticates the user and dispatches the standard
 * `launchAgentExecution` path, so executions performed from here count
 * the same as ones performed on the public URL.
 */
export default async function AgentAppPreviewPage({ params }: PreviewPageProps) {
  const { id } = await params;
  const app = await getAgentApp(id);

  return (
    <>
      <PageHeader>
        <AgentAppHeader appId={app.id} appName={app.name} active="preview" />
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
