// One map's workspace — PAGES: the read the bulk convergence workspace is
// built on. `?site=` picks which site's pages; without it the set is every site
// the caller may view that uses this map, never "all sites".
// See ../page.tsx: the screen is a route, the adapter is the ONE route host.

import { TopicalMapRouteBody } from "@/features/marketing/seo/topical-map/components/TopicalMapRouteBody";

export default async function BrandTopicalMapPagesPage({
  params,
}: {
  params: Promise<{ mapId: string }>;
}) {
  const { mapId } = await params;
  return <TopicalMapRouteBody mapId={mapId} />;
}
