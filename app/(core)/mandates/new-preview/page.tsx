import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { NewSoftMandatePage } from "@/features/mandates/authoring-level/NewSoftMandatePage";

/**
 * /mandates/new-preview — create a custom (soft) mandate of your own. Homed in
 * your personal organization, visible only to you until you share it. Built
 * beside the admin creation page (/administration/mandates/new, untouched).
 */
export default async function NewPersonalMandateRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/agents");
  return <NewSoftMandatePage level="person" />;
}
