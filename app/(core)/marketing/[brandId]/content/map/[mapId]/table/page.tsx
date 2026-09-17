// One map's workspace — the TABLE view.
// See ../page.tsx: the view is a route, the body is the ONE canonical workspace.

import { TopicalMapWorkspaceBody } from "@/features/marketing/seo/topical-map/components/TopicalMapWorkspaceBody";

export default async function BrandTopicalMapTablePage({
  params,
}: {
  params: Promise<{ mapId: string }>;
}) {
  const { mapId } = await params;
  return <TopicalMapWorkspaceBody mapId={mapId} />;
}
