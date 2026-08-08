"use client";

import React from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  Folder,
  LayoutDashboard,
  Loader2,
  Shield,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import {
  getOrganizationBySlugOrId,
  getUserRole,
} from "@/features/organizations/service";
import type { Organization, OrgRole } from "@/features/organizations/types";
import {
  OrgShortcutsProvider,
  type OrgShortcutsContextValue,
} from "./OrgShortcutsContext";

function getNavItems(orgId: string) {
  return [
    {
      name: "Dashboard",
      href: `/organizations/${orgId}/shortcuts`,
      icon: LayoutDashboard,
    },
    {
      name: "Shortcuts",
      href: `/organizations/${orgId}/shortcuts/shortcuts`,
      icon: Zap,
    },
    {
      name: "Categories",
      href: `/organizations/${orgId}/shortcuts/categories`,
      icon: Folder,
    },
    // Content blocks are managed in the canonical render-blocks editor
    // (/agent-connections/render-blocks — skill.render_definition).
  ];
}

function roleCanWrite(role: OrgRole | null): boolean {
  return role === "owner" || role === "admin";
}

export function OrgShortcutsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const urlOrgId = params.orgId as string;
  const pathname = usePathname();
  const router = useRouter();

  const [organization, setOrganization] = React.useState<Organization | null>(
    null,
  );
  const [role, setRole] = React.useState<OrgRole | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const org = await getOrganizationBySlugOrId(urlOrgId);
        if (!org) {
          setError("Organization not found");
          return;
        }
        setOrganization(org);
        const userRole = await getUserRole(org.id);
        if (!userRole) {
          setError("Access denied. You must be a member of this organization.");
          return;
        }
        setRole(userRole);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load organization";
        setError(message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [urlOrgId]);

  const isEditPage = pathname.includes("/shortcuts/edit/");

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-textured">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading organization…
        </div>
      </div>
    );
  }

  if (error || !organization || !role) {
    return (
      <div className="h-full flex items-center justify-center bg-textured p-4">
        <Card className="max-w-lg w-full p-8 border-destructive/30">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-destructive/10 rounded-full">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">
                {!organization ? "Organization Not Found" : "Access Denied"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {error ?? "You don't have permission to access this resource."}
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              <Button
                onClick={() => router.push(`/organizations/${urlOrgId}`)}
                variant="outline"
                size="sm"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Organization
              </Button>
              <Button
                onClick={() => router.push("/dashboard")}
                variant="outline"
                size="sm"
              >
                Dashboard
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Use the canonical slug for navigation URLs
  const navOrgId = organization.slug;
  const canWrite = roleCanWrite(role);
  const ctxValue: OrgShortcutsContextValue = {
    orgId: navOrgId,
    organizationId: organization.id,
    organizationName: organization.name,
    role,
    canWrite,
  };

  if (isEditPage) {
    return (
      <OrgShortcutsProvider value={ctxValue}>{children}</OrgShortcutsProvider>
    );
  }

  const navItems = getNavItems(navOrgId);

  return (
    <OrgShortcutsProvider value={ctxValue}>
      <RouteHeader
        left={<ChevronLeftTapButton href={`/organizations/${navOrgId}`} ariaLabel="Back" />}
        center={<RouteModeNav items={navItems} />}
        right={
          <Badge
            variant="outline"
            className="text-[11px] capitalize hidden sm:inline-flex items-center gap-1"
          >
            {canWrite ? (
              <Shield className="h-3 w-3" />
            ) : (
              <Eye className="h-3 w-3" />
            )}
            {role}
          </Badge>
        }
      />
      <div className="h-full overflow-hidden bg-textured">{children}</div>
    </OrgShortcutsProvider>
  );
}
