"use client";

// /organizations/[orgId]/mandates/[mandateKey] — ONE mandate from the
// ORGANIZATION's seat, built beside …/settings/mandates/[mandateKey]
// (untouched). The same record page as the admin and user previews with
// level="organization": owners/admins set the organization's binding (it runs
// for every member unless a member binds their own); members see what runs for
// them and why, read-only.

import { useParams } from "next/navigation";
import { MandateRecordPage } from "@/features/mandates/record-next/MandateRecordPage";
import { OrgMandateSeat } from "@/features/mandates/member-list/OrgMandateSeat";
import { orgMandateListHref } from "@/features/mandates/member-list/routes";

export default function OrgMandateRecordRoute() {
  const params = useParams();
  const orgSlugOrId = params.orgId as string;
  // Next.js already decodes dynamic segment params — never decode twice.
  const mandateKey = params.mandateKey as string;
  return (
    <OrgMandateSeat orgSlugOrId={orgSlugOrId}>
      {({ orgId, canManage }) => (
        <MandateRecordPage
          mandateKey={mandateKey}
          level="organization"
          orgId={orgId}
          canManageOrg={canManage}
          listHref={orgMandateListHref(orgSlugOrId)}
        />
      )}
    </OrgMandateSeat>
  );
}
