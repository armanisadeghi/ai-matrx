import { getAgent } from "@/lib/agents/data";
import { readLayoutCookie } from "@/app/(dev)/demos/resizables/_lib/readLayoutCookie";
import {
  SurfacesAdminShell,
  SURFACES_ADMIN_COOKIE,
} from "@/features/surfaces/admin/SurfacesAdminShell";

const ADMIN_BASE_PATH = "/administration/system-agents/agents";

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

  return (
    <SurfacesAdminShell
      agent={agent}
      backHref={`${ADMIN_BASE_PATH}/${id}`}
      basePath={ADMIN_BASE_PATH}
      defaultLayout={defaultLayout}
    />
  );
}
