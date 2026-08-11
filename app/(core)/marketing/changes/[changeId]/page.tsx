import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Generic entity door → the owning site's canonical Changes workspace. */
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
  const siteResponse = await supabase
    .schema("web")
    .from("site")
    .select("id,brand_id")
    .eq("id", changeResponse.data.site_id)
    .maybeSingle();
  if (siteResponse.error) throw siteResponse.error;
  if (!siteResponse.data?.brand_id) notFound();
  redirect(
    `/marketing/brands/${siteResponse.data.brand_id}/sites/${siteResponse.data.id}/changes?change=${changeId}`,
  );
}
