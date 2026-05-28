import { getAgent } from "@/lib/agents/data";
import { readLayoutCookie } from "@/app/(ssr)/demos/ssr/resizables/_lib/readLayoutCookie";
import {
  SurfacesAdminShell,
  SURFACES_ADMIN_COOKIE,
} from "@/features/surfaces/admin/SurfacesAdminShell";

export const metadata = {
  title: "Agent Surfaces | AI Matrx",
  description:
    "Bind this agent to UI surfaces and configure how surface-provided values map to its variables and context slots.",
};

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

  return (
    <SurfacesAdminShell
      agent={agent}
      backHref={`/agents/${id}`}
      defaultLayout={defaultLayout}
    />
  );
}
