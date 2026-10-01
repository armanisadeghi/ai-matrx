import StructuredListLanding from "@/features/structured-lists/StructuredListLanding";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import { PicklistsPage } from "@/features/user-lists/components/PicklistsPage";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

// /lists — one route, two audiences (module-landing-pages, "branch in page"): a signed-in person gets
// the Picklists page (every picklist, each opening at /lists/<id>); a guest gets the landing.
export default async function PicklistsRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (isAuthenticated) return <PicklistsPage />;
  return (
    <MarketingPageShell>
      <StructuredListLanding />
    </MarketingPageShell>
  );
}
