"use client";

/**
 * Shared gate for every /organizations/[orgId]/admin/* surface.
 * Resolves the org, checks org-admin role, and renders one of: loading / not-found /
 * access-denied / children(orgId, organization). The DB RPCs enforce the same gate;
 * this is the UX layer that keeps non-admins out of the surface entirely.
 */
import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Organization, OrgRole } from "../../types";
import { useOrgAdminGate } from "../hooks";

interface OrgAdminBoundaryProps {
  orgIdParam: string | undefined;
  children: (ctx: { orgId: string; organization: Organization; role: OrgRole }) => React.ReactNode;
}

export function OrgAdminBoundary({ orgIdParam, children }: OrgAdminBoundaryProps) {
  const router = useRouter();
  const { orgId, organization, role, isAdmin, loading, error } = useOrgAdminGate(orgIdParam);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading organization…</p>
        </div>
      </div>
    );
  }

  if (error || !orgId || !organization) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-lg border-destructive/30 bg-destructive/5 p-6 text-center">
          <h2 className="mb-2 text-lg font-semibold text-foreground">Organization not found</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {error ?? "This organization doesn't exist or you don't have access."}
          </p>
          <Button onClick={() => router.push("/organizations")} variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to organizations
          </Button>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-lg border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-900/20">
          <ShieldAlert className="mx-auto mb-3 h-7 w-7 text-amber-600 dark:text-amber-400" />
          <h2 className="mb-2 text-lg font-semibold text-foreground">Admin access required</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Only organization owners and admins can manage users.
          </p>
          <Button
            onClick={() => router.push(`/organizations/${organization.slug}`)}
            variant="outline"
            size="sm"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to {organization.name}
          </Button>
        </Card>
      </div>
    );
  }

  return <>{children({ orgId, organization, role: role ?? "member" })}</>;
}
