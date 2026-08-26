"use client";

// /organizations/[orgId]/settings/mandates/[mandateKey] — ONE mandate, the
// ORG principal. Same MandateWorkspace core; §4 writes principal_type='org'
// with the route's organization (the server's is_org_admin gate is the
// authority — this page's admin/owner gate mirrors it).

import { useParams } from "next/navigation";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { CrumbTrailHeader } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import {
  useResolvedOrganization,
  useUserRole,
} from "@/features/organizations/hooks";
import { OrganizationAccessGate } from "@/features/organizations/components/OrganizationAccessGate";
import { MandateWorkspace } from "@/features/agents/mandates/workspace/MandateWorkspace";

export default function OrgMandateWorkspacePage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const mandateKey = decodeURIComponent(params.mandateKey as string);
  const { organization, organizationId, loading, error, refresh } =
    useResolvedOrganization(orgId);
  const { loading: roleLoading, isOwner, isAdmin } = useUserRole(
    organizationId ?? undefined,
  );

  if (loading || roleLoading) return null;
  if (error || !organization || !organizationId || !(isOwner || isAdmin)) {
    return <OrganizationAccessGate orgSlugOrId={orgId} organizationId={organizationId} onRetry={refresh} />;
  }

  return (
    <>
      <PageHeader>
        <CrumbTrailHeader
          trail={[
            { label: organization.name, href: `/organizations/${orgId}` },
            {
              label: "Mandates",
              href: `/organizations/${orgId}/settings/mandates`,
            },
            { label: mandateKey },
          ]}
        />
      </PageHeader>
      <MandateWorkspace
        mandateKeyOrId={mandateKey}
        host="route"
        principal={{ kind: "org", orgId: organizationId }}
      />
    </>
  );
}
