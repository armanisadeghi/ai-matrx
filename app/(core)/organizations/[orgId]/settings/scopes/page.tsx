"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CrumbTrailHeader } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import {
  useResolvedOrganization,
  useUserRole,
} from "@/features/organizations/hooks";
import { OrganizationAccessGate } from "@/features/organizations/components/OrganizationAccessGate";
import { ScopeManagerPage } from "@/features/agent-context/components/scope-admin/ScopeManagerPage";

export default function OrganizationScopesPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;

  const {
    organization,
    organizationId,
    role,
    loading: resolving,
    error,
    refresh,
  } = useResolvedOrganization(orgId);
  const {
    loading: roleLoading,
    isOwner,
    isAdmin,
  } = useUserRole(organizationId ?? undefined);

  if (resolving || roleLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="h-7 w-56 bg-muted animate-pulse rounded" />
        <div className="h-4 w-80 bg-muted animate-pulse rounded" />
        <div className="grid gap-3 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4 space-y-2">
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              <div className="h-3 w-48 bg-muted animate-pulse rounded" />
              <div className="h-3 w-40 bg-muted animate-pulse rounded" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <OrganizationAccessGate
        orgSlugOrId={orgId}
        organizationId={organizationId}
        error={error}
        onRetry={refresh}
      />
    );
  }

  // NOT an access-gate case: this person can open the org, they simply aren't
  // an admin of it. That is a role fact we KNOW, so we state it plainly — the
  // gate is for the four things we can't know, not for every locked door.
  if (!role || (!isAdmin && !isOwner)) {
    return (
      <div className="p-4 md:p-6">
        <Card className="max-w-lg mx-auto p-6 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <div className="text-center">
            <ShieldAlert className="h-8 w-8 text-amber-600 dark:text-amber-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-2">
              Admin Access Required
            </h2>
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
              Only admins and owners can manage organization scopes.
            </p>
            <Button
              onClick={() => router.push(`/organizations/${orgId}/settings`)}
              variant="outline"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Settings
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
      <CrumbTrailHeader
        backHref={`/organizations/${orgId}/settings`}
        trail={[
          { label: organization.name, href: `/organizations/${orgId}` },
          { label: "Settings", href: `/organizations/${orgId}/settings` },
          { label: "Scopes" },
        ]}
      />
      <ScopeManagerPage
        organizationId={organization.id}
        organizationName={organization.name}
        isPersonal={organization.isPersonal}
      />
    </>
  );
}
