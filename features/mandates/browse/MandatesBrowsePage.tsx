"use client";

// features/mandates/browse/MandatesBrowsePage.tsx
//
// /mandates — the mandates registry on the canonical entity-list shell
// (2026-08-26 rework). Everything mandate-specific lives in ./listConfig.tsx;
// this file is the config plus this page's slots. No prose header — the page
// title bar (PageHeader) carries the identity, the list carries the work.
//
// 🚨 BROWSE + THEIR OWN OVERRIDE, nothing more (Arman, 2026-08-29). Declaring
// a mandate is a platform decision, not a user one, so creation moved to
// /administration/mandates/new and this page has no New button.
//
// 🚨 OWNERSHIP TABS (one-resolution, 2026-09-07). A mandate's home is its
// ORGANIZATION (D-R3), so the tabs are the organizations the caller belongs to
// — a personal workspace included, because a personal workspace is just an
// organization — plus the platform's own corpus for a Matrx admin. A non-admin
// never sees the System tab; if one asks for that home anyway (a pasted
// `?scope=system` link), the door refuses with its reason and the shell prints
// it. Nothing here decides who may see what: `mnd_list_scoped` does, and it is
// the only thing that does.
//
// The tab picks OWNERSHIP. RESOLUTION is always the caller's own, in their
// ACTIVE organization (D-R1) — so "Fulfilled by" and "Decided by" answer "what
// runs for me right now" on every tab, which is the one question this page is
// for.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { MandatesHeader } from "@/features/mandates/components/MandatesHeader";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAdminLevel } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useUserOrganizations } from "@/features/organizations/hooks";
import type { ListScope, ListScopeKind } from "@/lib/list-scope/types";
import { mandateListConfig } from "./listConfig";
import { MandateCoverageProvider } from "./CoverageBadge";
import { MandateHomeNamesProvider } from "./MandateHome";
import { MandateCoverageNotice, useCoverageList } from "./useCoverageList";
import type { MandateHomeOrganization } from "./service";

/**
 * What the tab in front of the reader actually contains, in words. The shared
 * tab strip has one generic label for the organization axis and an "All"
 * entry inside it, so the two states are spelled out here rather than left to
 * be inferred from a count.
 */
function HomeNotice({
  scope,
  organizations,
}: {
  scope: ListScope;
  organizations: readonly MandateHomeOrganization[];
}) {
  const narrowedTo =
    scope.kind === "orgs" && scope.organizationId
      ? organizations.find((org) => org.id === scope.organizationId)
      : undefined;
  const text =
    scope.kind === "system"
      ? "Every job the platform itself ships. Changing one of these changes it for everyone on AI Matrx."
      : narrowedTo
        ? `Jobs added by ${narrowedTo.name}. The platform's own jobs are under All.`
        : "Every job the platform ships, plus the jobs your organizations have added.";
  return (
    <p className="rounded-lg border border-border/60 bg-card px-3 py-2 text-[12px] text-muted-foreground">
      {text}
    </p>
  );
}

export function MandatesBrowsePage() {
  // The door's system gate is `public.is_platform_admin()`, which is TRUE for
  // any Matrx admin level — so the tab is offered on exactly that bar, never a
  // stricter one the database would then contradict.
  const isPlatformAdmin = useAppSelector(selectAdminLevel) !== null;
  const activeOrganizationId = useAppSelector(selectOrganizationId);
  const { organizations: memberships } = useUserOrganizations();

  const organizations: MandateHomeOrganization[] = memberships.map((org) => ({
    id: org.id,
    name: org.name,
  }));

  const scopes: ListScopeKind[] = isPlatformAdmin
    ? ["orgs", "system"]
    : ["orgs"];

  // The blended home is the honest start: an organization with no mandates of
  // its own would otherwise open on an empty screen while the platform's 400+
  // jobs it inherits sit one click away with no sign they exist.
  const { view, service } = useCoverageList({
    mode: {
      kind: "homes",
      activeOrganizationId,
      organizations,
      canListSystemHome: isPlatformAdmin,
    },
  });

  return (
    <>
      <PageHeader>
        <MandatesHeader />
      </PageHeader>
      <MandateHomeNamesProvider>
        <MandateCoverageProvider value={view}>
          <EntityListPage
            config={{ ...mandateListConfig, service }}
            scopes={scopes}
            defaultScope={{ kind: "orgs", organizationId: null }}
            notice={(list) => (
              <div className="space-y-2">
                <HomeNotice
                  scope={list.query.scope}
                  organizations={organizations}
                />
                <MandateCoverageNotice list={list} />
              </div>
            )}
          />
        </MandateCoverageProvider>
      </MandateHomeNamesProvider>
    </>
  );
}
