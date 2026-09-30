// app/(core)/masterwork/page.tsx
//
// One URL, two audiences (module-landing-pages doctrine, "Bounce in" posture).
// Guests get the public Masterwork pitch, never a login wall. Signed-in Experts
// land on the Masterwork home dashboard (Arman 2026-09-30: "signed-in Experts
// land on the Masterwork home dashboard; approved") — the list of every Rulebook
// stays one click away at /masterwork/all, linked from this page's header.

import Link from "next/link";
import { List } from "lucide-react";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { MandateDoorLink } from "@/features/mandates/components/MandateDoorLink";
import MasterworkLanding from "@/features/auth/components/module-landing/landings/MasterworkLanding";
import { MasterworkHomePage } from "@/features/masterwork/home/MasterworkHomePage";

export default async function MasterworkRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    return (
      <MarketingPageShell>
        <MasterworkLanding />
      </MarketingPageShell>
    );
  }
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-1 p-0">
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Masterwork
          </h1>
          <Link
            href="/masterwork/all"
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <List className="h-3.5 w-3.5" />
            All Rulebooks
          </Link>
          <MandateDoorLink
            feature="masterwork"
            label="Masterwork agents"
            className="mr-1"
          />
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured pt-[calc(var(--shell-header-h)+1rem)]">
        <MasterworkHomePage />
      </div>
    </>
  );
}
