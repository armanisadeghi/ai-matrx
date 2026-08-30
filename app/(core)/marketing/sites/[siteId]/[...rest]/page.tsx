import { notFound, permanentRedirect } from "next/navigation";

import { mapLegacySiteRest } from "@/features/marketing/lib/legacy-marketing-urls";
import { resolveLegacySiteDoor } from "@/features/marketing/lib/legacy-site-door";
import { marketingRoutes } from "@/features/marketing/lib/routes";

type SearchParams = Record<string, string | string[] | undefined>;

function toSearchParams(query: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value))
      value.forEach((entry) => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  }
  return params;
}

function withQuery(path: string, params: URLSearchParams): string {
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * LEGACY URL shim. The canonical site URL is client-first and split by job:
 * `/marketing/[brandKey]/websites/[siteKey]/…` for what the site IS, and
 * `/marketing/[brandKey]/seo/[siteKey]/…` for the practice on it. This route
 * resolves the owning brand server-side and 308s to the real address, so old
 * bookmarks and cross-links built from rows that only know `site_id` keep
 * working forever.
 */
export default async function LegacyFlatSiteSectionRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string; rest?: string[] }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ siteId, rest = [] }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const search = toSearchParams(query);

  // Site-level cost was retired with the dead web.batch projection. Old
  // bookmarks still owe the user a door, so that one legacy URL goes to the
  // live workspace-wide provider-spend surface instead of a 404 — and it needs
  // no brand, so it answers before the lookup.
  if (rest.length === 1 && rest[0] === "cost") {
    permanentRedirect(withQuery(marketingRoutes.cost(), search));
  }

  const door = await resolveLegacySiteDoor(siteId);
  if (!door) notFound();
  permanentRedirect(
    mapLegacySiteRest(door.brandSeg, door.siteSeg, rest, search),
  );
}
