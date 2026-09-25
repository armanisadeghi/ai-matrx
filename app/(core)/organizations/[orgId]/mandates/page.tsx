"use client";

// /organizations/[orgId]/mandates — the NEW organization mandate list, built
// beside /organizations/[orgId]/settings/mandates (untouched). The same list
// component as the user and admin lists, level="organization": every row says
// what runs the job for every member of this organization. Members read;
// owners and admins also create the organization's own soft mandates.

import { useParams } from "next/navigation";
import { MandateMemberListPage } from "@/features/mandates/member-list/MandateMemberListPage";
import { OrgMandateSeat } from "@/features/mandates/member-list/OrgMandateSeat";

export default function OrgMandatesListRoute() {
  const params = useParams();
  const orgSlugOrId = params.orgId as string;
  return (
    <OrgMandateSeat orgSlugOrId={orgSlugOrId}>
      {({ orgId, orgName, canManage }) => (
        <MandateMemberListPage
          level="organization"
          orgId={orgId}
          orgName={orgName}
          canManageOrg={canManage}
        />
      )}
    </OrgMandateSeat>
  );
}
