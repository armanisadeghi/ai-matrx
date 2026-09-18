// One map's workspace — HISTORY: what left the map, and who sent it there
// (`seo.list_map_history`). Rejecting never deletes.
// See ../page.tsx: the screen is a route, the adapter is the ONE route host.

import { TopicalMapRouteBody } from "@/features/marketing/seo/topical-map/components/TopicalMapRouteBody";

export default async function BrandTopicalMapHistoryPage({
  params,
}: {
  params: Promise<{ mapId: string }>;
}) {
  const { mapId } = await params;
  return <TopicalMapRouteBody mapId={mapId} />;
}
