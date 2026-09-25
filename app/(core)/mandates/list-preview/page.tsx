import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { MandateMemberListPage } from "@/features/mandates/member-list/MandateMemberListPage";

/**
 * /mandates/list-preview — the NEW user mandate list (Mine · My Orgs · System),
 * built beside /mandates (untouched) on the admin list's shell. Every row says
 * what runs the job FOR YOU. Served by public.mnd_member_list.
 */
export default async function UserMandatesListPreviewRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/agents");
  return <MandateMemberListPage level="person" />;
}
