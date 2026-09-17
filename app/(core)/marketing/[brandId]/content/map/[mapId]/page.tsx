// One map's workspace — the OUTLINE view, which is the index.
//
// A view is a ROUTE, not a tab — the same shape the content plan uses. The body
// is the ONE canonical workspace; it reads the active screen from this path and
// takes selection, expansion, filters and the site in scope from the
// topical-map Redux slice, which is what makes them survive the switch.

import { TopicalMapWorkspaceBody } from "@/features/marketing/seo/topical-map/components/TopicalMapWorkspaceBody";

export default async function BrandTopicalMapOutlinePage({
  params,
}: {
  params: Promise<{ mapId: string }>;
}) {
  const { mapId } = await params;
  return <TopicalMapWorkspaceBody mapId={mapId} />;
}
