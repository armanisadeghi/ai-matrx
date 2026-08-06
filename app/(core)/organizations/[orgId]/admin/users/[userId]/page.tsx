"use client";

import { useParams } from "next/navigation";
import { OrgAdminBoundary } from "@/features/organizations/admin/components/OrgAdminBoundary";
import { MemberDetailView } from "@/features/organizations/admin/components/MemberDetailView";

/**
 * Single member admin detail.
 * Route: /organizations/[orgId]/admin/users/[userId]
 */
export default function OrgAdminMemberPage() {
  const params = useParams();
  const orgIdParam = params.orgId as string;
  const userId = params.userId as string;

  return (
    <OrgAdminBoundary orgIdParam={orgIdParam}>
      {({ orgId, organization }) => (
        <MemberDetailView orgId={orgId} organization={organization} userId={userId} />
      )}
    </OrgAdminBoundary>
  );
}
