"use client";

// /organizations/[orgId]/mandates/new — create a custom (soft) mandate for this
// organization. Owners and admins only (the server re-checks); a member meets
// a plain sentence instead of a form that would be refused.

import { useParams } from "next/navigation";
import { NewSoftMandatePage } from "@/features/mandates/authoring-level/NewSoftMandatePage";
import { OrgMandateSeat } from "@/features/mandates/member-list/OrgMandateSeat";

export default function NewOrgMandateRoute() {
  const params = useParams();
  const orgSlugOrId = params.orgId as string;
  return (
    <OrgMandateSeat orgSlugOrId={orgSlugOrId}>
      {({ orgId, orgName, canManage }) =>
        canManage ? (
          <NewSoftMandatePage level="organization" orgId={orgId} orgName={orgName} />
        ) : (
          <p className="mx-auto max-w-md px-6 py-16 text-center text-sm text-muted-foreground">
            Only the owners and admins of {orgName} can create its mandates. You can create one of
            your own from your personal mandates page.
          </p>
        )
      }
    </OrgMandateSeat>
  );
}
