import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { loginHref } from "@/utils/auth/auth-destination";

/**
 * /workflows — RESERVED for the public marketing page about workflows
 * (Arman, 2026-08-18). It is deliberately not built yet.
 *
 * Until it exists, a signed-in visitor is sent to the catalog they came for.
 * A signed-out visitor is sent to sign in and lands back on the catalog
 * afterwards — `loginHref` carries the destination, so the marketing page can
 * later take this route over without anyone losing where they were going.
 */
export default async function WorkflowsIndexRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (isAuthenticated) redirect("/workflows/all");
  redirect(loginHref("/workflows/all"));
}
