import { notFound, permanentRedirect } from "next/navigation";
import { mapLegacySiteRest } from "@/features/marketing/lib/legacy-marketing-urls";

/**
 * Cross-branch safety net. ~130 components still compose links as
 * `${sitePath}/<old section>` and `sitePath` is now the BRANCH base, so an SEO
 * section composed on the websites base (or a renamed section like `ranks`)
 * lands here. The shared legacy mapper sends it to its one real home; a path
 * that maps back to itself is a genuine 404.
 */
export default async function WebsitesBranchSectionMapper({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string; siteId: string; rest: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { brandId, siteId, rest } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
  }
  const target = mapLegacySiteRest(brandId, siteId, rest, query);
  const incoming = `/marketing/${brandId}/websites/${siteId}/${rest.join("/")}`;
  if (target.split("?")[0] === incoming) notFound();
  permanentRedirect(target);
}
