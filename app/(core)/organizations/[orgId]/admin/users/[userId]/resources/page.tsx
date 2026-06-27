"use client";

import { useParams } from "next/navigation";
import { OrgAdminBoundary } from "@/features/organizations/admin/components/OrgAdminBoundary";
import { MemberResourcesView } from "@/features/organizations/admin/components/MemberResourcesView";

/**
 * A member's org-scoped resource inventory.
 * Route: /organizations/[orgId]/admin/users/[userId]/resources
 */
export default function OrgAdminMemberResourcesPage() {
  const params = useParams();
  const orgIdParam = params.orgId as string;
  const userId = params.userId as string;

  return (
    <OrgAdminBoundary orgIdParam={orgIdParam}>
      {({ orgId, organization }) => (
        <MemberResourcesView orgId={orgId} organization={organization} userId={userId} />
      )}
    </OrgAdminBoundary>
  );
}
