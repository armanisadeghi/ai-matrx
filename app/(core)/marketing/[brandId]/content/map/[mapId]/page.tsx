// One map's workspace — the OUTLINE view, which is the index.
//
// A view is a ROUTE, not a tab — the same shape the content plan uses. Every
// one of the six screens renders the SAME adapter: `TopicalMapRouteBody` reads
// the screen from this path, the brand from the route tree and `?site=` /
// `?topic=` from the URL, then hands the canonical workspace body its props.
// Selection, expansion, filters and the site in scope live in the topical-map
// Redux slice, which is what makes them survive the switch.

import { TopicalMapRouteBody } from "@/features/marketing/seo/topical-map/components/TopicalMapRouteBody";

export default async function BrandTopicalMapOutlinePage({
  params,
}: {
  params: Promise<{ mapId: string }>;
}) {
  const { mapId } = await params;
  return <TopicalMapRouteBody mapId={mapId} />;
}
