import { notFound, redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve a plan-node identity to the exact node in its site workspace. */
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

  redirect(
    `/marketing/content-plan/${response.data.site_id}?view=tree&node=${nodeId}`,
  );
}
