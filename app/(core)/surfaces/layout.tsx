// Server Component layout. Guests never see the surfaces hub (or the
// /surfaces/<name> detail pages) — there is no marketing landing for this
// feature yet, so they get the shared ModuleSignInGate panel
// (module-landing-pages doctrine).

import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/surfaces", {
  title: "Surfaces",
  description:
    "Per-page agent roles and settings — pick which agents power each surface, for you or your org.",
  letter: "Sf",
});

export default async function SurfacesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Surfaces"
        route="/surfaces"
        description="Pick which agents power each page of your workspace and tune per-surface settings."
      />
    );
  }
  return children;
}
