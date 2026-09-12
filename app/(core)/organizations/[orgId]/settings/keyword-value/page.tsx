"use client";

/**
 * Organization keyword-value settings — what every brand and site in this
 * organization uses unless it overrides them. Second rung of the ladder
 * (KI-046): platform → organization → brand → site.
 */

import { useParams } from "next/navigation";
import { Skeleton } from "@ai-matrx/design-system";
import { AutonomyModesEditor } from "@/features/marketing/seo/value-system/settings/AutonomyModesEditor";
import { ValueSettingsEditor } from "@/features/marketing/seo/value-system/settings/ValueSettingsEditor";
import { OrganizationAccessGate } from "@/features/organizations/components/OrganizationAccessGate";
import { useResolvedOrganization } from "@/features/organizations/hooks";

export default function OrgValueSettingsPage() {
  const params = useParams();
  const orgSlugOrId =
    typeof params.orgId === "string" ? params.orgId : undefined;
  const { organizationId, loading, error, refresh } =
    useResolvedOrganization(orgSlugOrId);

  if (!orgSlugOrId) return null;
  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (error || !organizationId) {
    return (
      <OrganizationAccessGate
        orgSlugOrId={orgSlugOrId}
        organizationId={organizationId}
        error={error}
        onRetry={refresh}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <ValueSettingsEditor scope="org" id={organizationId} />
        <AutonomyModesEditor scope="org" id={organizationId} />
      </div>
    </div>
  );
}
