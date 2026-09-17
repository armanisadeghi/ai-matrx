// One map's workspace — the TEXT view: `seo.map_outline`, exactly what an agent
// receives, read-only.
// See ../page.tsx: the view is a route, the body is the ONE canonical workspace.

import { TopicalMapWorkspaceBody } from "@/features/marketing/seo/topical-map/components/TopicalMapWorkspaceBody";

export default async function BrandTopicalMapTextPage({
  params,
}: {
  params: Promise<{ mapId: string }>;
}) {
  const { mapId } = await params;
  return <TopicalMapWorkspaceBody mapId={mapId} />;
}
