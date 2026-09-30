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
// /administration/intelligence/mandates/new and this page has no New button.
//
// 🚨 LANES (active-org law, 2026-09-30). The standard lanes, declared once:
// All (default, via the lists.landing_tab knob) = the platform's own jobs plus
// every organization the caller belongs to; My Orgs = mandates homed in the
// caller's organizations; System = the platform's own corpus, for a Matrx
// admin. No Mine (a mandate has no person owner) and no My team
// (`lanes: { team: false }`). Which organization a list narrows to is the page's
// organization filter (`?org_filter=`, default All organizations) — never the
// active organization. Nothing here decides who may see what: `mnd_list_scoped`
// does, and it is the only thing that does.
//
// "Fulfilled by" / "Decided by" resolve against the page organization filter
// when one is set, else each mandate's OWN home organization — computed by the
// list door, never from the active organization. The coverage report (badges
// and the coverage filter) follows the same filter.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { MandatesHeader } from "@/features/mandates/components/MandatesHeader";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAdminLevel } from "@/lib/redux/selectors/userSelectors";
import { useUserOrganizations } from "@/features/organizations/hooks";
import type { ListScopeKind } from "@/lib/list-scope/types";
import { usePageOrgFilter } from "@/features/mandates/display-org";
import { mandateListConfig } from "./listConfig";
import { MANDATE_LIST_SCOPES } from "./types";
import { MandateCoverageProvider } from "./CoverageBadge";
import { MandateHomeNamesProvider } from "./MandateHome";
import { MandateCoverageNotice, useCoverageList } from "./useCoverageList";
import type { MandateHomeOrganization } from "./service";

export function MandatesBrowsePage() {
  // The System lane is open to everyone signed in (AO-340): the door's System home returns the
  // platform mandates the caller already reads through All, row security staying the ceiling.
  // `isPlatformAdmin` only decides the `admin` key of the service key below.
  const isPlatformAdmin = useAppSelector(selectAdminLevel) !== null;
  const {
    organizations: memberships,
    loading: organizationsLoading,
    error: organizationsError,
  } = useUserOrganizations();

  const organizations: MandateHomeOrganization[] = memberships.map((org) => ({
    id: org.id,
    name: org.name,
  }));

  const scopes: ListScopeKind[] = [...MANDATE_LIST_SCOPES, "system"];
  const pageOrgFilter = usePageOrgFilter();

  const { view, service } = useCoverageList({
    organizationId: pageOrgFilter,
    mode: {
      kind: "homes",
      organizations,
      organizationsLoading,
      organizationsError,
      canListSystemHome: true,
    },
  });

  // 🚨 WHAT THIS SERVICE WAS BUILT FROM (one-resolution FIX-R6/F1).
  //
  // `useUserOrganizations` answers AFTER the first render. Without this key the
  // shell fetched its scope counts exactly once — with zero organizations —
  // and never re-asked, because the query had not changed: `counts.narrow.orgs`
  // stayed empty forever and the declared **Organization** section did not
  // render at all for an admin who belongs to nine of them. The key changes the
  // moment the memberships land, so the counts are re-asked with the real
  // homes. Measured on production v0.4.1722.
  const serviceKey = JSON.stringify({
    orgs: organizations.map((o) => o.id),
    loading: organizationsLoading,
    error: organizationsError,
    admin: isPlatformAdmin,
  });

  return (
    <>
      <PageHeader>
        <MandatesHeader />
      </PageHeader>
      <MandateHomeNamesProvider>
        <MandateCoverageProvider value={view}>
          <EntityListPage
            config={{ ...mandateListConfig, service, serviceKey }}
            scopes={scopes}
            notice={(list) => <MandateCoverageNotice list={list} />}
          />
        </MandateCoverageProvider>
      </MandateHomeNamesProvider>
    </>
  );
}
