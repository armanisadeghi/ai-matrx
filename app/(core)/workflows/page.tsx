// app/(core)/workflows/page.tsx
//
// /workflows — one URL, two audiences (module-landing-pages doctrine).
//
// A guest gets the public marketing landing for the workflow product; they are
// NEVER bounced to a login wall. A signed-in visitor is sent straight to their
// library at /workflows/all — the pitch has nothing to tell someone who already
// has the thing, and the run stage lives behind an id.
//
// The sign-in door on the landing is built with `loginHref` inside
// `ModuleLanding`, so a returning user still lands on /workflows/all after
// signing in — the behavior this placeholder route used to provide directly.

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import WorkflowsLanding from "@/features/auth/components/module-landing/landings/WorkflowsLanding";

export default async function WorkflowsIndexRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (isAuthenticated) redirect("/workflows/all");
  return (
    <MarketingPageShell>
      <WorkflowsLanding />
    </MarketingPageShell>
  );
}
