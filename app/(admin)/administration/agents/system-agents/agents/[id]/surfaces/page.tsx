import { getAgent } from "@/lib/agents/data";
import { readLayoutCookie } from "@/features/resizable-panels/readLayoutCookie";
import {
  SurfacesAdminShell,
  SURFACES_ADMIN_COOKIE,
} from "@/features/surfaces/admin/SurfacesAdminShell";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

const ADMIN_BASE_PATH = "/administration/agents/system-agents/agents";

export default async function AdminSystemAgentSurfacesPage({
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
        fallbackHref="/administration/agents/system-agents"
        fallbackLabel="System agents"
      />
    );
  }

  return (
    <SurfacesAdminShell
      agent={agent}
      backHref={`${ADMIN_BASE_PATH}/${id}`}
      basePath={ADMIN_BASE_PATH}
      defaultLayout={defaultLayout}
    />
  );
}
