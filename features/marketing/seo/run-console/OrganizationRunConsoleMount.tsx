"use client";

/**
 * The run console at the ORGANIZATION tier — every brand this organization
 * controls.
 *
 * KI-049 (Arman's ruling, 2026-08-25): the same `RunConsole` component the
 * system tier mounts at `/administration/marketing/run-console`, at a
 * different `scope`. Split into its own client component because the route
 * (`app/(core)/marketing/automations/page.tsx`) is a Server Component that
 * exports real `metadata` — a "use client" page cannot also export
 * `metadata`.
 *
 * This fulfills the `marketing.automations` Coming Soon promise — see
 * `lib/coming-soon/registry.ts` (entry removed in this change) and
 * `features/marketing/lib/marketing-nav.ts` (status dropped in this change).
 * Never re-fork this into a second console.
 */

import { usePathname } from "next/navigation";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import { useOrgFilterParam } from "@/lib/entity-list/orgFilterUrl";
import { RunConsole } from "./RunConsole";
import { runConsoleBasePath } from "./routed-view";

export function OrganizationRunConsoleMount({
  /**
   * The result view fixed by the ROUTE — `/marketing/operations/automations/
   * {proposals,unplaced,history}`, the bare route being This run. Left out,
   * the console keeps its own local tab state.
   */
  view,
}: {
  view?: string;
} = {}) {
  // The brands across ALL the person's organizations, narrowed only by the
  // page's own organization filter (`?org_filter=`, default All organizations)
  // — never by the active organization (active-org law). Runs still launch in
  // each brand's own organization (RunConsole supplies it per site).
  const [organizationId, setOrganizationId] = useOrgFilterParam();
  const pathname = usePathname();
  const basePath = pathname ? runConsoleBasePath(pathname, view) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 justify-end px-2 pt-1">
        <EntityOrgFilter orgId={organizationId} onChange={setOrganizationId} />
      </div>
      <div className="min-h-0 flex-1">
        <RunConsole
          scope={{ tier: "organization", organizationId }}
          view={view}
          basePath={basePath}
        />
      </div>
    </div>
  );
}
