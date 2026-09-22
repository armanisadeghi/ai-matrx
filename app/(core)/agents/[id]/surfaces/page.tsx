import { getAgent } from "@/lib/agents/data";
import { readLayoutCookie } from "@/features/resizable-panels/readLayoutCookie";
import {
  SurfacesAdminShell,
  SURFACES_ADMIN_COOKIE,
} from "@/features/surfaces/admin/SurfacesAdminShell";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export default async function AgentSurfacesRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [agent, defaultLayout] = await Promise.all([
    getAgent(id),
    readLayoutCookie(SURFACES_ADMIN_COOKIE),
  ]);

  // A null read is ambiguous under RLS (denied / deleted / never existed /
  // session expired) — the gate asks the platform which one it actually is
  // instead of a generic 404.
  if (!agent) {
    return (
      <AccessGate
        token="agent"
        id={id}
        fallbackHref="/agents"
        fallbackLabel="All agents"
      />
    );
  }

  return (
    <SurfacesAdminShell
      agent={agent}
      // agent-link-ok: this page IS /agents/[id]; reaching it proves a user agent
      backHref={`/agents/${id}`}
      basePath="/agents"
      defaultLayout={defaultLayout}
    />
  );
}
