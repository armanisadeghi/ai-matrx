"use client";

import React from "react";
import { useParams, usePathname } from "next/navigation";
import {
  Eye,
  Folder,
  LayoutDashboard,
  Loader2,
  Shield,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { useResolvedOrganization } from "@/features/organizations/hooks";
import { OrganizationAccessGate } from "@/features/organizations/components/OrganizationAccessGate";
import type { OrgRole } from "@/features/organizations/types";
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

  const { organization, organizationId, role, loading, error, refresh } =
    useResolvedOrganization(urlOrgId);

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

  // No org, or an org this person isn't a member of. Both branches used to
  // assert a reason ("Organization Not Found" / "Access Denied") that the code
  // had no way to establish. The gate resolves it and, when they really are
  // locked out, hands them a one-click way to ask the owner.
  if (!organization || !role) {
    return (
      <div className="h-full bg-textured">
        <OrganizationAccessGate
          orgSlugOrId={urlOrgId}
          organizationId={organizationId}
          error={error}
          onRetry={refresh}
          fallbackHref={`/organizations/${urlOrgId}`}
          fallbackLabel="Back to organization"
        />
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
        left={
          <ChevronLeftTapButton
            href={`/organizations/${navOrgId}`}
            ariaLabel="Back"
          />
        }
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
      <div className="h-full overflow-y-auto overflow-x-hidden bg-textured">
        {children}
      </div>
    </OrgShortcutsProvider>
  );
}
