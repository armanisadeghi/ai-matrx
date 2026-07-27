import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { webDb } from "@/utils/supabase/webDb";

/**
 * Short-link resolver for a canonical page: /marketing/pages/[pageId] →
 * the full brand/site workspace route. Exists so generic association UIs
 * (entityRegistry hrefFor) can open a page from its id alone — the real
 * workspace route needs brandId + siteId in the path.
 */
export default async function MarketingPageShortLink({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;
  const supabase = await createClient();
  const db = webDb(supabase);
  const pageResponse = await db
    .from("page")
    .select("id, site_id")
    .eq("id", pageId)
    .is("deleted_at", null)
    .maybeSingle();
  if (pageResponse.error) throw pageResponse.error;
  if (!pageResponse.data) notFound();
  const siteResponse = await db
    .from("site")
    .select("id, brand_id")
    .eq("id", pageResponse.data.site_id)
    .maybeSingle();
  if (siteResponse.error) throw siteResponse.error;
  if (!siteResponse.data?.brand_id) notFound();
  redirect(
    `/marketing/brands/${siteResponse.data.brand_id}/sites/${siteResponse.data.id}/pages/${pageId}`,
  );
}
