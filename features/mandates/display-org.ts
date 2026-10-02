// features/mandates/display-org.ts
//
// THE ORGANIZATION A MANDATE DISPLAY RESOLVES "WHO FULFILS THIS" IN.
//
// Active-org law (common-docs/policies/access-ladder.md) and
// its mandates ruling: on any list or display, resolution follows the page's
// organization filter (`?org_filter=`) when one is set, else the mandate's OWN
// home organization — never the active organization. The active organization is
// only where new things are saved and which org a RUNTIME call runs in.
//
// A system-homed mandate, or one homed in an organization the person does not
// belong to, has no organization the person can resolve in, so it resolves in
// none (no org rung) rather than in whichever org the header happens to show.

import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { useOrgFilterParam } from "@/lib/entity-list/orgFilterUrl";

/** Pure: which organization a display resolves in. */
export function displayResolutionOrgId(input: {
  pageOrgFilter: string | null | undefined;
  homeOrganizationId: string | null | undefined;
  memberOrganizationIds: readonly string[];
}): string | null {
  if (input.pageOrgFilter) return input.pageOrgFilter;
  const home = input.homeOrganizationId;
  if (!home || home === SYSTEM_ORGANIZATION_ID) return null;
  return input.memberOrganizationIds.includes(home) ? home : null;
}

/** The page's organization filter from the URL; null = All organizations. */
export function usePageOrgFilter(): string | null {
  return useOrgFilterParam()[0];
}
