import { notFound, redirect } from "next/navigation";

import { marketingRoutes } from "@/features/marketing/lib/routes";
import { resolveLegacySiteAddress } from "@/features/marketing/lib/shim-resolve-server";
import { createClient } from "@/utils/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generic entity door → the owning site's canonical Changes workspace, which
 * is part of the SEO practice on that site:
 * /marketing/[brand]/seo/[site]/changes?change=<id>.
 */
export default async function MarketingChangeShortLink({
  params,
}: {
  params: Promise<{ changeId: string }>;
}) {
  const { changeId } = await params;
  if (!UUID_RE.test(changeId)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/marketing/changes/${changeId}`);
  const changeResponse = await supabase
    .schema("seo")
    .from("change_set")
    .select("id,site_id")
    .eq("id", changeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (changeResponse.error) throw changeResponse.error;
  if (!changeResponse.data) notFound();
  const address = await resolveLegacySiteAddress(changeResponse.data.site_id);
  if (!address) notFound();
  redirect(
    marketingRoutes.siteChanges(address.brandSeg, address.siteSeg, changeId),
  );
}
