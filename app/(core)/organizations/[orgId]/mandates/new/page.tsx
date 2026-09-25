"use client";

// /organizations/[orgId]/mandates/new — create a custom (soft) mandate for this
// organization. Owners and admins only (the server re-checks); a member meets
// the route header, a way to ask the admins, and a door to a personal one.

import { useParams } from "next/navigation";
import { NewSoftMandatePage } from "@/features/mandates/authoring-level/NewSoftMandatePage";
import { OrgMandateSeat } from "@/features/mandates/member-list/OrgMandateSeat";
import { OrgMandateCreateRefusal } from "@/features/mandates/member-list/OrgMandateCreateRefusal";

export default function NewOrgMandateRoute() {
  const params = useParams();
  const orgSlugOrId = params.orgId as string;
  return (
    <OrgMandateSeat orgSlugOrId={orgSlugOrId}>
      {({ orgId, orgName, canManage }) =>
        canManage ? (
          <NewSoftMandatePage level="organization" orgId={orgId} orgName={orgName} />
        ) : (
          <OrgMandateCreateRefusal orgId={orgId} orgName={orgName} />
        )
      }
    </OrgMandateSeat>
  );
}
