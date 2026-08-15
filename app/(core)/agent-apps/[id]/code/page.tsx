import { getAgentApp } from "@/lib/agent-apps/data";
import { AgentAppHeader } from "@/features/agent-apps/components/route-header/AgentAppHeader";
import { AgentAppEditPageClient } from "./AgentAppEditPageClient";

interface CodePageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentAppCodePage({ params }: CodePageProps) {
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
        active="code"
      />
      {/* Whole-surface editor (activity bar, file tabs, chat) is static
          chrome, not scrolling content — it must start below the glass
          header rather than sliding behind it (same pattern as /code). */}
      <div
        className="h-full overflow-hidden"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <AgentAppEditPageClient app={app} />
      </div>
    </>
  );
}
