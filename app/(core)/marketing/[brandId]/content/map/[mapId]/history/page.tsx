// One map's workspace — HISTORY: what left the map, and who sent it there
// (`seo.list_map_history`, U6's read). Rejecting never deletes.
// See ../page.tsx: the screen is a route, the body is the ONE canonical workspace.

import { TopicalMapWorkspaceBody } from "@/features/marketing/seo/topical-map/components/TopicalMapWorkspaceBody";

export default async function BrandTopicalMapHistoryPage({
  params,
}: {
  params: Promise<{ mapId: string }>;
}) {
  const { mapId } = await params;
  return <TopicalMapWorkspaceBody mapId={mapId} />;
}
