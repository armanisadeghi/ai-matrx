// app/(core)/masterwork/page.tsx
//
// The Masterwork landing — one URL, two audiences (module-landing-pages
// doctrine). Guests get the public marketing landing (never a login wall);
// signed-in users get the Masterwork HOME: their Rulebooks with review
// progress, built Masterworks with release state + quality trend, recent
// runs, Approach start tiles, and "How it's improving". The Rulebook list
// lives at /masterwork/all; Encore at /masterwork/encore.

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import MasterworkLanding from "@/features/auth/components/module-landing/landings/MasterworkLanding";
import { MasterworkHomePage } from "@/features/masterwork/home/MasterworkHomePage";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/masterwork", {
  title: "Masterwork",
  description:
    "Your expertise as rules you approve — built into a system that works exactly your way, proven against plain AI.",
  letter: "Mw",
});

export default async function MasterworkRoute() {
  const { isAuthenticated } = await getServerAuth();
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
        <div className="flex w-full min-w-0 items-center gap-0 p-0">
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Masterwork
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured pt-[calc(var(--shell-header-h)+1rem)]">
        <MasterworkHomePage />
      </div>
    </>
  );
}
