// One map's workspace — the GRAPH view.
// See ../page.tsx: the view is a route, the body is the ONE canonical workspace.

import { TopicalMapWorkspaceBody } from "@/features/marketing/seo/topical-map/components/TopicalMapWorkspaceBody";

export default async function BrandTopicalMapGraphPage({
  params,
}: {
  params: Promise<{ mapId: string }>;
}) {
  const { mapId } = await params;
  return <TopicalMapWorkspaceBody mapId={mapId} />;
}
