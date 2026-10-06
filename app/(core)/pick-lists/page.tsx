import PickListsLanding from "@/features/data-tables/pick-lists/components/PickListsLanding";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import { PickListsPage } from "@/features/data-tables/pick-lists/components/PickListsPage";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

// /pick-lists — one route, two audiences (module-landing-pages, "branch in page"): a signed-in person gets
// the Picklists page (every picklist, each opening at /pick-lists/<id>); a guest gets the landing.
export default async function PicklistsRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (isAuthenticated) return <PickListsPage />;
  return (
    <MarketingPageShell>
      <PickListsLanding />
    </MarketingPageShell>
  );
}
