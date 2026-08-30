import { notFound, redirect } from "next/navigation";

import { marketingRoutes } from "@/features/marketing/lib/routes";
import { resolveLegacySiteAddress } from "@/features/marketing/lib/shim-resolve-server";
import { createClient } from "@/utils/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a plan-node identity to the exact node in its site workspace — now
 * the brand-first address /marketing/[brand]/content/plan/[site]. The tree is
 * the workspace index, so no view segment is emitted; `?node=` still carries
 * the selection.
 */
export default async function ContentPlanNodeShortLink({
  params,
}: {
  params: Promise<{ nodeId: string }>;
}) {
  const { nodeId } = await params;
  if (!UUID_RE.test(nodeId)) notFound();

  const supabase = await createClient();
  const response = await supabase
    .schema("plan")
    .from("node")
    .select("site_id")
    .eq("id", nodeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (response.error || !response.data) notFound();

  const address = await resolveLegacySiteAddress(response.data.site_id);
  if (!address) notFound();

  redirect(
    `${marketingRoutes.brandContentPlanSite(address.brandSeg, address.siteSeg)}?node=${nodeId}`,
  );
}
