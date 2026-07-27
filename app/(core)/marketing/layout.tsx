// app/(core)/marketing/layout.tsx
//
// Auth branch for the whole Marketing module, decided SERVER-side (no client
// flash, and the workspace tree never enters a guest's bundle).
//
// Guests get the full marketing landing on ANY /marketing/* URL — never a login
// wall, never an error (`.claude/skills/module-landing-pages`, invariant 1).
// Signed-in users fall through to the real workspace; `AuthedWorkspaceCTA`
// inside ModuleLanding is what gives a signed-in visitor the way in when they
// do land on the pitch.
//
// getServerAuth() is request-scope cached — the (core) layout already called
// it, so this costs nothing.

import { headers } from "next/headers";

import MarketingLanding from "@/features/auth/components/module-landing/landings/MarketingLanding";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import { getMarketingRouteMetadata } from "@/features/marketing/lib/route-metadata";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export async function generateMetadata() {
  const pathname = (await headers()).get("x-pathname") ?? "/marketing";
  return getMarketingRouteMetadata(pathname);
}

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();

  if (!isAuthenticated) {
    return (
      <MarketingPageShell>
        <MarketingLanding />
      </MarketingPageShell>
    );
  }

  return children;
}
