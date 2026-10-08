import { Handshake } from "lucide-react";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { DealsPageWithDrill } from "@/features/crm/components/deals/DealsPageWithDrill";

/**
 * /crm/deals — deals + kanban pipelines: the dense list (saved-view capable)
 * and the drag-to-stage board, one toggle apart. No SSR seed on purpose — the
 * list is scope-driven and server-paginated (see /crm's page.tsx).
 */
export default async function CrmDealsRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Deals"
        route="/crm/deals"
        description="Track deals through your pipeline — value, stage, owner, expected close, and the activity behind each one."
        icon={Handshake}
      />
    );
  }

  return (
    <>
      <RecordPageHeader record={{ name: "Deals" }} />
      <DealsPageWithDrill />
    </>
  );
}
