"use client";

import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  useResolvedOrganization,
  useUserRole,
} from "@/features/organizations/hooks";
import { OrganizationAccessGate } from "@/features/organizations/components/OrganizationAccessGate";
import { OrgManage } from "@/features/organizations/components/OrgManage";

/**
 * Organization Settings Page
 * Route: /organizations/[orgId]/settings
 * [orgId] accepts either a UUID or a slug.
 */
export default function OrganizationSettingsPage() {
  const params = useParams();
  const orgId = params.orgId as string;

  const {
    organization,
    organizationId,
    role,
    loading: resolving,
    error,
    refresh,
  } = useResolvedOrganization(orgId);

  // OrgManage needs the owner/admin split, which `useUserRole` derives.
  const {
    loading: roleLoading,
    isOwner,
    isAdmin,
  } = useUserRole(organizationId ?? undefined);

  if (resolving || roleLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading organization…</p>
        </div>
      </div>
    );
  }

  // No org, or an org this person isn't in. The page used to assert
  // "Organization Not Found" / "This organization doesn't exist or you don't
  // have access" — a hedge written because the code genuinely could not tell.
  // The gate can, so it does.
  if (!organization || !role) {
    return (
      <OrganizationAccessGate
        orgSlugOrId={orgId}
        organizationId={organizationId}
        error={error}
        onRetry={refresh}
      />
    );
  }

  return (
    <OrgManage
      organization={organization}
      userRole={role}
      isOwner={isOwner}
      isAdmin={isAdmin}
    />
  );
}
