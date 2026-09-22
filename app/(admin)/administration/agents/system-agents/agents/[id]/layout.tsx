import { getAgent } from "@/lib/agents/data";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { AgentHydratorServer } from "@/features/agents/route/AgentHydratorServer";
import { SystemAgentSurfaceEmitter } from "@/features/agents/components/admin/SystemAgentSurfaceEmitter";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);
  // A null read is ambiguous (denied / deleted / never existed) — the layout
  // body renders the real answer via <AccessGate>; the tab title stays generic.
  if (!agent) {
    return createDynamicRouteMetadata(
      "/administration/agents/system-agents/agents",
      { title: "Agent (System)" },
    );
  }
  return createDynamicRouteMetadata(
    "/administration/agents/system-agents/agents",
    {
      title: `${agent.name} (System)`,
      description:
        agent.description || `Administer the ${agent.name} system agent.`,
    },
  );
}

export default async function AdminSystemAgentDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);

  // A null read is ambiguous under RLS (denied / deleted / never existed /
  // session expired) — the gate asks the platform which one it actually is
  // instead of a generic 404. Nothing under this layout can render without it.
  if (!agent) {
    return (
      <AccessGate
        token="agent"
        id={id}
        fallbackHref="/administration/agents/system-agents"
        fallbackLabel="System agents"
      />
    );
  }

  // This is the SYSTEM agents admin — a personal (non-builtin) agent open
  // here is almost always a mistake (e.g. global-binding your own agent when
  // you meant its system twin). Make it impossible to miss: banner + tinted
  // background for the whole detail area.
  const isPersonalAgent = agent.agentType !== "builtin";

  return (
    <SystemAgentSurfaceEmitter agentId={id}>
      <AgentHydratorServer agentId={id} />
      {isPersonalAgent ? (
        <div className="flex h-full flex-col overflow-hidden bg-amber-500/10">
          <div className="shrink-0 border-b border-amber-500/40 bg-amber-500/20 px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:text-amber-200">
            NOT A SYSTEM AGENT — &ldquo;{agent.name}&rdquo; is a personal agent
            open in the system-agents admin. Changes and bindings here act on
            the personal agent, not a system one. Use Linked Agent Sync to reach
            or create its system version.
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {children}
          </div>
        </div>
      ) : (
        <div className="h-full overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      )}
    </SystemAgentSurfaceEmitter>
  );
}
