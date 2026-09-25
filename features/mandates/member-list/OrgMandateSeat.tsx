"use client";

// features/mandates/member-list/OrgMandateSeat.tsx
//
// THE ORGANIZATION SEAT for the org mandate pages (/organizations/<org>/mandates…):
// resolves the route's organization (slug or id) and the viewer's role in it,
// and hands the page `{ orgId, orgName, canManage }`. Every MEMBER gets in
// (read-only); owners and admins manage. A non-member meets the organization
// access gate — the same gate the owner's settings pages use.

import type { ReactNode } from "react";
import { useResolvedOrganization, useUserRole } from "@/features/organizations/hooks";
import { OrganizationAccessGate } from "@/features/organizations/components/OrganizationAccessGate";

export interface OrgMandateSeatValue {
  orgId: string;
  orgName: string;
  canManage: boolean;
}

export function OrgMandateSeat({
  orgSlugOrId,
  children,
}: {
  orgSlugOrId: string;
  children: (seat: OrgMandateSeatValue) => ReactNode;
}) {
  const { organization, organizationId, loading, error, refresh } =
    useResolvedOrganization(orgSlugOrId);
  const { loading: roleLoading, role, isOwner, isAdmin } = useUserRole(
    organizationId ?? undefined,
  );

  if (loading || roleLoading) {
    return (
      <div className="flex h-full flex-col gap-2 p-3" aria-busy="true" aria-label="Loading organization">
        <div className="h-8 w-72 animate-pulse rounded-md bg-muted" />
        <div className="h-64 w-full animate-pulse rounded-md bg-muted/60" />
      </div>
    );
  }
  if (error || !organization || !organizationId || !role) {
    return (
      <OrganizationAccessGate
        orgSlugOrId={orgSlugOrId}
        organizationId={organizationId}
        onRetry={refresh}
      />
    );
  }
  return (
    <>
      {children({
        orgId: organizationId,
        orgName: organization.name,
        canManage: isOwner || isAdmin,
      })}
    </>
  );
}
