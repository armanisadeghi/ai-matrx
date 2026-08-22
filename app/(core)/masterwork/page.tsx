// app/(core)/masterwork/page.tsx
//
// The Masterwork MARKETING page — one URL, two audiences (module-landing-pages
// doctrine, "Bounce in" posture). Guests get the public pitch, never a login
// wall. Signed-in users are pushed straight to their work at /masterwork/all,
// which is the list surface built on the canonical entity-list template.

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import MasterworkLanding from "@/features/auth/components/module-landing/landings/MasterworkLanding";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/masterwork", {
  title: "Masterwork",
  description:
    "Your expertise as rules you approve — built into a system that works exactly your way, proven against plain AI.",
  letter: "M",
});

export default async function MasterworkRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (isAuthenticated) redirect("/masterwork/all");
  return (
    <MarketingPageShell>
      <MasterworkLanding />
    </MarketingPageShell>
  );
}
