"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getOrganizationBySlugOrId,
  getUserRole,
} from "@/features/organizations/service";
import type { Organization } from "@/features/organizations/types";

interface OrgResourceLayoutProps {
  children: React.ReactNode;
  resourceName: string;
  icon?: React.ReactNode;
}

/**
 * Shared layout for organization resource pages.
 * Accepts [orgId] param as either a UUID or a slug.
 */
export function OrgResourceLayout({
  children,
  resourceName,
  icon,
}: OrgResourceLayoutProps) {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;

  const [organization, setOrganization] = React.useState<Organization | null>(
    null,
  );
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function loadOrganization() {
      try {
        setLoading(true);
        setError(null);

        const org = await getOrganizationBySlugOrId(orgId);
        if (!org) {
          setError("Organization not found");
          return;
        }
        setOrganization(org);

        const role = await getUserRole(org.id);
        if (!role) {
          setError(
            "Access denied. You must be a member to view organization resources.",
          );
          return;
        }
        setUserRole(role);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to load organization";
        console.error("Error loading organization:", err);
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    loadOrganization();
  }, [orgId]);

  if (loading) {
    return (
      <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-textured">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (error || !organization || !userRole) {
    const backHref = `/organizations/${orgId}`;
    return (
      <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-textured p-4">
        <Card className="max-w-lg w-full p-8 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
              {icon || (
                <Home className="h-8 w-8 text-red-600 dark:text-red-400" />
              )}
            </div>
            <h2 className="text-xl font-semibold text-red-900 dark:text-red-100 mb-2">
              {!organization ? "Organization Not Found" : "Access Denied"}
            </h2>
            <p className="text-sm text-red-700 dark:text-red-300 mb-6">
              {error || "You don't have permission to access this resource."}
            </p>
            <div className="flex gap-2 justify-center">
              <Button
                onClick={() => router.push(backHref)}
                variant="outline"
                size="sm"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Organization
              </Button>
              <Button
                onClick={() => router.push("/dashboard")}
                variant="outline"
                size="sm"
              >
                <Home className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const orgHref = `/organizations/${organization.slug}`;

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col bg-textured">
      {/* Header with Breadcrumbs */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(orgHref)}
                className="flex-shrink-0"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-muted-foreground">/</span>
                <button
                  onClick={() => router.push(orgHref)}
                  className="text-sm font-medium hover:text-primary transition-colors truncate"
                >
                  {organization.name}
                </button>
                <span className="text-sm text-muted-foreground">/</span>
                <div className="flex items-center gap-2">
                  {icon && (
                    <span className="text-primary flex-shrink-0">{icon}</span>
                  )}
                  <span className="text-sm font-medium truncate">
                    {resourceName}
                  </span>
                </div>
              </div>
            </div>
            <Badge
              variant="secondary"
              className="text-xs flex-shrink-0 capitalize"
            >
              {userRole}
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}
