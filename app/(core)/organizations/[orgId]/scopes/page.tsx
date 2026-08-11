"use client";

// Dedicated scopes surface for an organization. Resolves the org and hands
// it off to ScopesManager, which renders a minimal org-identity header
// followed by per-scope-type cards with inline add/edit/open flows.

import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useResolvedOrganization } from "@/features/organizations/hooks";
import { OrganizationAccessGate } from "@/features/organizations/components/OrganizationAccessGate";
import { ScopesManager } from "@/features/scopes/components/management/ScopesManager";

export default function OrgScopesPage() {
  const params = useParams();
  const orgSlugOrId = params.orgId as string;

  const { organization, organizationId, role, loading, error, refresh } =
    useResolvedOrganization(orgSlugOrId);

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-textured">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="h-dvh bg-textured">
        <OrganizationAccessGate
          orgSlugOrId={orgSlugOrId}
          organizationId={organizationId}
          error={error}
          onRetry={refresh}
        />
      </div>
    );
  }

  return (
    <div className="h-dvh overflow-y-auto bg-textured">
      <div className="max-w-[1800px] mx-auto px-4 md:px-6 lg:px-8 pt-12 pb-12">
        <ScopesManager organization={organization} role={role} />
      </div>
    </div>
  );
}
