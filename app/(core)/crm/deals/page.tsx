import { Handshake } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { DealsPage } from "@/features/crm/components/deals/DealsPage";

/**
 * /crm/deals — deals + kanban pipelines: the dense list (saved-view capable)
 * and the drag-to-stage board, one toggle apart. No SSR seed on purpose — the
 * list is scope-driven and server-paginated (see /crm's page.tsx).
 */
export default async function CrmDealsRoute() {
  const { isAuthenticated } = await getServerAuth();
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
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2 px-1">
          <Handshake className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate text-sm font-semibold text-foreground">
            Deals
          </h1>
        </div>
      </PageHeader>
      <DealsPage />
    </>
  );
}
