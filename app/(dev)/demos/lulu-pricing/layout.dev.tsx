// The Lulu print calculator calls /lulu/* on the aidream server, which is
// mounted behind `require_authenticated` — a signed-out visitor's request
// was always going to fail server-side. Before the org-context kernel went
// fail-closed (aidream 8e5ee0b93), that surfaced as a network 401 the client
// component didn't handle either; now it surfaces as the client-side
// `OrganizationContextError` before any request even fires ("Select an
// organization before sending this request."). Either way, an anonymous
// visitor must never see a raw error — branch on the server per the
// module-landing-pages doctrine (see MapsLayout for the same pattern).
import { Printer } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";

export default async function LuluPricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Print Pricing Calculator"
        route="/demos/lulu-pricing"
        description="Sign in to price a print-on-demand book live — sized, bound, and shipped, calculated against the real Lulu catalog."
        icon={Printer}
      />
    );
  }
  return children;
}
