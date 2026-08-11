"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CrumbTrailHeader } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import { useResolvedOrganization } from "@/features/organizations/hooks";
import { OrganizationAccessGate } from "@/features/organizations/components/OrganizationAccessGate";

interface OrgResourceLayoutProps {
  children: React.ReactNode;
  resourceName: string;
}

/**
 * Shared layout for organization resource pages.
 * Accepts [orgId] param as either a UUID or a slug.
 */
export function OrgResourceLayout({
  children,
  resourceName,
}: OrgResourceLayoutProps) {
  const params = useParams();
  const orgId = params.orgId as string;

  const {
    organization,
    organizationId,
    role: userRole,
    loading,
    error,
    refresh,
  } = useResolvedOrganization(orgId);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-textured">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  // Either the org didn't come back, or it did and this person isn't a member.
  // Both used to be hand-written sentences ("Organization Not Found" / "Access
  // denied. You must be a member.") that the code could not know were true.
  // The gate resolves which of the four it actually is and, when they're
  // genuinely locked out, lets them ask the owner in one click.
  if (!organization || !userRole) {
    return (
      <div className="h-full bg-textured">
        <OrganizationAccessGate
          orgSlugOrId={orgId}
          organizationId={organizationId}
          error={error}
          onRetry={refresh}
        />
      </div>
    );
  }

  const orgHref = `/organizations/${organization.slug}`;

  return (
    <>
      <CrumbTrailHeader
        backHref={orgHref}
        trail={[
          { label: organization.name, href: orgHref },
          { label: resourceName },
        ]}
        right={
          <Badge variant="secondary" className="text-xs capitalize">
            {userRole}
          </Badge>
        }
      />
      <div className="h-full overflow-y-auto bg-textured">
        <div className="max-w-7xl mx-auto p-4 md:p-6">{children}</div>
      </div>
    </>
  );
}
