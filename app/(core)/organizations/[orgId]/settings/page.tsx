"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useOrganization, useUserRole } from "@/features/organizations/hooks";
import { OrgSettings } from "@/features/organizations/components/OrgSettings";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";

/**
 * Organization Settings Page
 * Route: /organizations/[orgId]/settings
 * [orgId] accepts either a UUID or a slug.
 */
export default function OrganizationSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;

  const [resolvedOrgId, setResolvedOrgId] = React.useState<string | null>(null);
  const [resolveError, setResolveError] = React.useState<string | null>(null);
  const [resolving, setResolving] = React.useState(true);

  React.useEffect(() => {
    async function resolve() {
      try {
        const org = await getOrganizationBySlugOrId(orgId);
        if (!org) {
          setResolveError("Organization not found");
          return;
        }
        setResolvedOrgId(org.id);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to load organization";
        setResolveError(msg);
      } finally {
        setResolving(false);
      }
    }
    resolve();
  }, [orgId]);

  const {
    organization,
    loading: orgLoading,
    error: orgError,
  } = useOrganization(resolvedOrgId ?? "");

  const {
    role,
    loading: roleLoading,
    isOwner,
    isAdmin,
  } = useUserRole(resolvedOrgId ?? "");

  const loading = resolving || orgLoading || roleLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading organization…</p>
        </div>
      </div>
    );
  }

  if (resolveError || orgError || !organization) {
    return (
      <div className="p-4 md:p-6">
        <Card className="max-w-lg mx-auto p-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
              Organization Not Found
            </h2>
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">
              {resolveError ||
                orgError ||
                "This organization doesn't exist or you don't have access."}
            </p>
            <Button
              onClick={() => router.push("/organizations")}
              variant="outline"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Organizations
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="p-4 md:p-6">
        <Card className="max-w-lg mx-auto p-6 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-2">
              Access Denied
            </h2>
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
              You are not a member of this organization.
            </p>
            <Button
              onClick={() => router.push("/organizations")}
              variant="outline"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Organizations
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <OrgSettings
        organization={organization}
        userRole={role}
        isOwner={isOwner}
        isAdmin={isAdmin}
      />
    </div>
  );
}
