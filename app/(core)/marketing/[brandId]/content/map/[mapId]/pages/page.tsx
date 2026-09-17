// One map's workspace — PAGES: the read the bulk convergence workspace (U5) is
// built on. `?site=` picks which site's pages; without it the set is every site
// the caller may view that uses this map, never "all sites".
// See ../page.tsx: the screen is a route, the body is the ONE canonical workspace.

import { TopicalMapWorkspaceBody } from "@/features/marketing/seo/topical-map/components/TopicalMapWorkspaceBody";

export default async function BrandTopicalMapPagesPage({
  params,
}: {
  params: Promise<{ mapId: string }>;
}) {
  const { mapId } = await params;
  return <TopicalMapWorkspaceBody mapId={mapId} />;
}
