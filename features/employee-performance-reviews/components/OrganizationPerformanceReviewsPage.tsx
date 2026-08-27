"use client";

import { Skeleton } from "@/components/ui/skeleton";
import PerformanceReviewApp from "@/features/employee-performance-reviews/components/PerformanceReviewApp";
import { organizationPerformanceReviewStorageKey } from "@/features/employee-performance-reviews/use-reviews";
import { OrganizationAccessGate } from "@/features/organizations/components/OrganizationAccessGate";
import { useResolvedOrganization } from "@/features/organizations/hooks";
import { CrumbTrailHeader } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import { organizationPerformanceReviewsManifest } from "@/features/surfaces/manifests/organization-performance-reviews.manifest";

export function OrganizationPerformanceReviewsPage({
  orgSlugOrId,
}: {
  orgSlugOrId: string;
}) {
  const { organization, organizationId, role, loading, error, refresh } =
    useResolvedOrganization(orgSlugOrId);

  if (loading) {
    return (
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <div className="flex h-full">
          <div className="hidden w-72 flex-none space-y-3 border-r border-border p-4 lg:block">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
          <div className="flex-1 space-y-4 p-4 sm:p-6">
            <Skeleton className="h-10 w-full" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!organization || !organizationId || !role) {
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
    <>
      <CrumbTrailHeader
        backHref={`/organizations/${encodeURIComponent(organization.slug)}`}
        trail={[
          {
            label: organization.name,
            href: `/organizations/${encodeURIComponent(organization.slug)}`,
          },
          { label: organizationPerformanceReviewsManifest.label },
        ]}
      />
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <PerformanceReviewApp
          storageKey={organizationPerformanceReviewStorageKey(organization.id)}
          organization={{
            id: organization.id,
            slug: organization.slug,
            name: organization.name,
            viewerRole: role,
          }}
          showHero={false}
        />
      </div>
    </>
  );
}
