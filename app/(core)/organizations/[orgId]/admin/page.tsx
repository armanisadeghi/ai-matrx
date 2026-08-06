"use client";

import { useParams } from "next/navigation";
import { OrgAdminBoundary } from "@/features/organizations/admin/components/OrgAdminBoundary";
import { OrgAdminDashboard } from "@/features/organizations/admin/components/OrgAdminDashboard";

/**
 * Org-admin user-management hub.
 * Route: /organizations/[orgId]/admin  ([orgId] = UUID or slug)
 */
export default function OrgAdminPage() {
  const params = useParams();
  const orgIdParam = params.orgId as string;

  return (
    <OrgAdminBoundary orgIdParam={orgIdParam}>
      {({ orgId, organization, role }) => (
        <OrgAdminDashboard orgId={orgId} organization={organization} role={role} />
      )}
    </OrgAdminBoundary>
  );
}
