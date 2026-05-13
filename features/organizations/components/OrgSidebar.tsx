"use client";

import React from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  Building2,
  Crown,
  Shield,
  User as UserIcon,
  Loader2,
  Settings,
  Tags,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserOrganizations, useUserRole } from "../hooks";
import type { OrganizationWithRole } from "../types";
import { InlineMediaRef } from "@/features/files";

/**
 * Compact organization sidebar for org settings layout
 * Shows all user's organizations with the active one highlighted,
 * plus sub-navigation links for the active org (Settings, Scopes).
 */
export function OrgSidebar() {
  const params = useParams();
  const pathname = usePathname();
  const activeOrgId = (params.orgId ?? params.id) as string;
  const { organizations, loading } = useUserOrganizations();
  const { isAdmin, isOwner } = useUserRole(activeOrgId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const personalOrg = organizations.find((org) => org.isPersonal);
  const teamOrgs = organizations.filter((org) => !org.isPersonal);

  // activeOrgId may be a slug or UUID; OrgNavItem always uses org.id for href
  const settingsBase = `/organizations/${activeOrgId}/settings`;
  const isSettingsActive = pathname === settingsBase;
  const isScopesActive = pathname === `${settingsBase}/scopes`;

  return (
    <nav className="space-y-4">
      {personalOrg && (
        <div>
          <div className="px-2 mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Personal
          </div>
          <OrgNavItem
            org={personalOrg}
            isActive={personalOrg.id === activeOrgId}
          />
        </div>
      )}

      {teamOrgs.length > 0 && (
        <div>
          <div className="px-2 mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Teams
          </div>
          <div className="space-y-0.5">
            {teamOrgs.map((org) => (
              <OrgNavItem
                key={org.id}
                org={org}
                isActive={org.id === activeOrgId}
              />
            ))}
          </div>
        </div>
      )}

      {activeOrgId && (
        <div>
          <div className="px-2 mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Manage
          </div>
          <div className="space-y-0.5">
            <Link
              href={settingsBase}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-sm",
                "hover:bg-muted",
                isSettingsActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Settings className="h-3.5 w-3.5 flex-shrink-0" />
              <span>General</span>
            </Link>
            {(isAdmin || isOwner) && (
              <Link
                href={`${settingsBase}/scopes`}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-sm",
                  "hover:bg-muted",
                  isScopesActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Tags className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Scopes</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

function OrgNavItem({
  org,
  isActive,
}: {
  org: OrganizationWithRole;
  isActive: boolean;
}) {
  const RoleIcon = getRoleIcon(org.role, org.isPersonal);

  return (
    <Link
      href={`/organizations/${org.slug ?? org.id}/settings`}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-sm",
        "hover:bg-muted",
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 w-6 h-6 rounded flex items-center justify-center",
          org.isPersonal
            ? "bg-purple-100 dark:bg-purple-900/30"
            : "bg-blue-100 dark:bg-blue-900/30",
        )}
      >
        <InlineMediaRef
          ref={org.logoUrl ?? null}
          size="fill"
          fit="cover"
          rounded="sm"
          fallbackIcon={
            <Building2
              className={cn(
                "h-3.5 w-3.5",
                org.isPersonal
                  ? "text-purple-600 dark:text-purple-400"
                  : "text-blue-600 dark:text-blue-400",
              )}
            />
          }
          alt=""
        />
      </div>
      <span className="flex-1 truncate">{org.name}</span>
      <RoleIcon
        className={cn(
          "h-3 w-3 flex-shrink-0",
          isActive ? "text-primary" : "text-muted-foreground",
        )}
      />
    </Link>
  );
}

function getRoleIcon(role: string, isPersonal: boolean) {
  if (isPersonal) return UserIcon;
  switch (role) {
    case "owner":
      return Crown;
    case "admin":
      return Shield;
    default:
      return UserIcon;
  }
}
