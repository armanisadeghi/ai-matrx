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
  refused,
}: {
  scope: ListScope;
  organizations: readonly MandateHomeOrganization[];
  /** The door refused this home — see below. */
  refused: boolean;
}) {
  // 🚨 ABSENT, NEVER FALSE (one-resolution R-O1). Every sentence below
  // DESCRIBES WHAT IS IN THE LIST. When the door refused this home there is no
  // list to describe, and printing "Every job the platform itself ships…" over
  // a refusal told the reader she was looking at a corpus she had just been
  // told she may not see. The refusal itself is the honest header.
  if (refused) return null;
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
  const {
    organizations: memberships,
    loading: organizationsLoading,
    error: organizationsError,
  } = useUserOrganizations();

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
      organizationsLoading,
      organizationsError,
      canListSystemHome: isPlatformAdmin,
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
    active: activeOrganizationId,
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
            defaultScope={{ kind: "orgs", organizationId: null }}
            notice={(list) => (
              <div className="space-y-2">
                <HomeNotice
                  scope={list.query.scope}
                  organizations={organizations}
                  refused={Boolean(list.error && !list.error.retryable)}
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
