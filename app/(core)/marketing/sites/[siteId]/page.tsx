import { notFound, permanentRedirect } from "next/navigation";

import { mapLegacySiteRest } from "@/features/marketing/lib/legacy-marketing-urls";
import { resolveLegacySiteDoor } from "@/features/marketing/lib/legacy-site-door";

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

/**
 * LEGACY door for the bare flat site address — see `./[...rest]/page.tsx` for
 * the sub-path variant. A site's home is now its website inventory overview
 * inside the owning client.
 */
export default async function LegacyFlatSiteRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ siteId }, query] = await Promise.all([params, searchParams]);
  const door = await resolveLegacySiteDoor(siteId);
  if (!door) notFound();
  permanentRedirect(
    mapLegacySiteRest(door.brandSeg, door.siteSeg, [], toSearchParams(query)),
  );
}
