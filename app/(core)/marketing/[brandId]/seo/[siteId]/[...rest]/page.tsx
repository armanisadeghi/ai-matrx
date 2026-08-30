import { notFound, permanentRedirect } from "next/navigation";
import { mapLegacySiteRest } from "@/features/marketing/lib/legacy-marketing-urls";

/**
 * Cross-branch safety net — twin of the one under `websites/[siteId]`.
 * A website-inventory section composed on the SEO base (`${sitePath}/pages`
 * from an SEO screen), or an old section name (`ranks`, `value/rules`), lands
 * here and 308s to its one real home via the shared legacy mapper. A path that
 * maps back to itself is a genuine 404.
 */
export default async function SeoBranchSectionMapper({
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
  console.log("[seo-rest] hit", rest.join("/"));
  const target = mapLegacySiteRest(brandId, siteId, rest, query);
  const incoming = `/marketing/${brandId}/seo/${siteId}/${rest.join("/")}`;
  if (target.split("?")[0] === incoming) notFound();
  permanentRedirect(target);
}
