"use client";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { initiativeListConfig } from "./listConfig";
import { InitiativeEditorDialog } from "./InitiativeEditorDialog";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingInitiativesScope } from "@/features/surfaces/manifests/marketing-initiatives.manifest";

export function InitiativesListPage({
  brandName,
}: {
  /**
   * 🚨 BRAND SCOPE (2026-08-30). This list is ORG-scoped by design, and the
   * brand route mounted it with nothing — so `/marketing/<client>/planning/
   * initiatives` opened on "All brands" and showed every OTHER client's goals,
   * timelines and budgets inside that client's workspace. Mounted from a brand
   * it now opens pre-filtered to that brand. It stays a DEFAULT rather than a
   * hidden predicate: the facet still carries every brand's true count and the
   * user can widen it deliberately (THE DOOR LAW), which a silent SQL filter
   * would quietly lie about.
   */
  brandName?: string | null;
} = {}) {
  const [creating, setCreating] = useState(false);
  const orgId = useAppSelector(selectActiveOrganizationId);
  const scopedConfig = useMemo(
    () =>
      brandName
        ? {
            ...initiativeListConfig,
            defaultFilters: {
              brand_name: { kind: "select" as const, values: [brandName] },
            },
          }
        : initiativeListConfig,
    [brandName],
  );
  const action = (
    <Button size="sm" className="h-11 lg:h-7" onClick={() => setCreating(true)}>
      <Plus className="h-4 w-4" />
      New initiative
    </Button>
  );
  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-initiatives"
      getScope={() => createMarketingInitiativesScope({ page_kind: "list" })}
    >
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-semibold">Initiatives</h1>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Goals, timelines, and budgets across channels
          </span>
        </div>
      </PageHeader>
      <EntityListPage
        config={scopedConfig}
        headerActions={action}
        emptyAction={action}
      />
      <InitiativeEditorDialog
        open={creating}
        onOpenChange={setCreating}
        organizationId={orgId}
        onSaved={() => window.location.reload()}
      />
    </SurfaceRuntimeProvider>
  );
}
