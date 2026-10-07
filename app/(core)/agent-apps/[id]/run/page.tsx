import { getAgentApp } from "@/lib/agent-apps/data";
import { AgentAppHeader } from "@/features/agent-apps/components/route-header/AgentAppHeader";
import { AppletHostMount } from "@/features/applets-host/AppletHostMount";

interface RunPageProps {
  params: Promise<{ id: string }>;
}

/**
 * /agent-apps/[id]/run — runs the user's actual Applet inside the management
 * shell, through the same Applet host as `/apps/<slug>` and `/p/<slug>`,
 * framed by the sub-route header so the user can flip back to Code or Settings.
 */
export default async function AgentAppRunPage({ params }: RunPageProps) {
  const { id } = await params;
  const app = await getAgentApp(id);

  return (
    <>
      <AgentAppHeader
        appId={app.id}
        appName={app.name}
        initialStatus={app.status}
        initialPublishedToWeb={app.published_to_web}
        active="run"
      />
      <div className="h-full min-h-0 overflow-auto">
        <AppletHostMount appletId={app.id} slug={app.slug} />
      </div>
    </>
  );
}
