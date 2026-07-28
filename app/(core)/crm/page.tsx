import { redirect } from "next/navigation";
import { Contact } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { CrmListPage } from "@/features/crm/components/CrmListPage";
import { CRM_SURFACE_NAME } from "@/features/surfaces/manifests/crm.manifest";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";

/**
 * /crm — the CRM entry list: People and Companies (crm.party), table-first,
 * on the canonical entity-list shape proven at /agents/all.
 *
 * No SSR seed on purpose — the list is scope-driven and server-paginated, so
 * a seed fetched before the user's scope/sort/page is known would be thrown
 * away (see app/(core)/agents/all/page.tsx).
 */
export default async function CrmRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/crm");

  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2 px-1">
          <Contact className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            {getSurfaceDisplayLabel(CRM_SURFACE_NAME)}
          </span>
        </div>
      </PageHeader>
      <CrmListPage />
    </>
  );
}
