"use client";

import { useState } from "react";
import { Building2, Circle, Globe, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsOwner, useSharing } from "@/utils/permissions/hooks";
import { PermissionsList } from "@/features/sharing/components/PermissionsList";
import { ShareWithUserTab } from "@/features/sharing/components/tabs/ShareWithUserTab";
import { ShareWithOrgTab } from "@/features/sharing/components/tabs/ShareWithOrgTab";
import { PublicAccessTab } from "@/features/sharing/components/tabs/PublicAccessTab";
import { AccessSummaryPanel } from "@/features/sharing/components/AccessSummaryPanel";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";

type ShareSubTab = "users" | "organizations" | "public";

/**
 * Site-root sharing on the canonical permissions system — the same
 * ShareModal machinery every other entity uses, composed as a full-page
 * panel (precedent: AgentSharePanel). One grant on `web_site` conveys the
 * whole subtree (pages, crawls, snapshots, findings) via reachability.
 */
export function SiteAccessWorkspace() {
  const { site } = useMarketingSite();
  const [activeSubTab, setActiveSubTab] = useState<ShareSubTab>("users");

  const ownership = useIsOwner("web_site", site.id);
  const {
    permissions,
    isPublic: resourceIsPublic,
    loading,
    error,
    shareWithUser,
    shareWithOrg,
    makePublic,
    revokeAccess,
    updateLevel,
    refresh,
  } = useSharing("web_site", site.id, true);

  // Ownership has three states; only a resolved, error-free answer may
  // unlock (or hide) the grant controls.
  const isOwner = !ownership.loading && !ownership.error && ownership.isOwner;

  const userPermissions = permissions.filter((p) => p.grantedToUserId);
  const orgPermissions = permissions.filter((p) => p.grantedToOrganizationId);
  const publicPermission = permissions.find((p) => p.isPublic);

  // Every grant mutation refreshes `permissions`; this signature makes the
  // summary refetch in lockstep so the two can never contradict each other.
  const grantSignature = permissions
    .map((p) => `${p.id}:${p.permissionLevel}`)
    .concat(resourceIsPublic ? "public" : "not-public")
    .join("|");

  const subTabs: {
    id: ShareSubTab;
    label: string;
    icon: React.ElementType;
    count?: number;
  }[] = [
    {
      id: "users",
      label: "Users",
      icon: Users,
      count: userPermissions.length || undefined,
    },
    {
      id: "organizations",
      label: "Organizations",
      icon: Building2,
      count: orgPermissions.length || undefined,
    },
    { id: "public", label: "Public", icon: Globe },
  ];

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-textured">
      <div className="mx-auto flex h-full w-full max-w-3xl min-h-0 flex-col p-3 sm:p-4">
        <div className="mb-3 flex items-start gap-2 shrink-0">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <h1 className="text-sm font-semibold">Site access</h1>
            <p className="text-xs text-muted-foreground">
              One grant shares {site.name} and every page, crawl, snapshot,
              finding, and artifact beneath it.
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card">
          <div className="flex items-end border-b border-border bg-muted/10 shrink-0">
            {subTabs.map((tab) => {
              const Icon = tab.icon as React.FC<React.SVGProps<SVGSVGElement>>;
              const isActive = tab.id === activeSubTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-all duration-150 shrink-0",
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {tab.count != null && tab.count > 0 && (
                    <span className="px-1 py-0.5 text-[10px] bg-primary/10 rounded-full leading-none">
                      {tab.count}
                    </span>
                  )}
                  {tab.id === "public" && publicPermission && (
                    <Circle className="h-1.5 w-1.5 fill-emerald-500 text-emerald-500" />
                  )}
                </button>
              );
            })}
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {/*
               * The truthful summary — direct grants below are only ONE of
               * the ways this site is reachable; this lists all of them.
               */}
              <AccessSummaryPanel
                entityType="web_site"
                entityId={site.id}
                refreshToken={grantSignature}
                className="px-0 pt-0 border-b border-border/40 pb-3"
              />

              {ownership.error && (
                <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-xs text-destructive">
                    Could not determine whether you own this site:{" "}
                    {ownership.error}
                  </p>
                </div>
              )}
              {!ownership.loading && !ownership.error && !isOwner && (
                <p className="text-xs text-muted-foreground">
                  Only the site owner can change sharing.
                </p>
              )}

              {activeSubTab === "users" && (
                <>
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Current Access
                    </h3>
                    <PermissionsList
                      permissions={userPermissions}
                      isOwner={isOwner}
                      onUpdateLevel={updateLevel}
                      onRevoke={revokeAccess}
                      loading={loading}
                    />
                  </div>
                  {isOwner && (
                    <ShareWithUserTab
                      onShare={shareWithUser}
                      onSuccess={refresh}
                      resourceType="web_site"
                      resourceId={site.id}
                    />
                  )}
                </>
              )}

              {activeSubTab === "organizations" && (
                <>
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Current Access
                    </h3>
                    <PermissionsList
                      permissions={orgPermissions}
                      isOwner={isOwner}
                      onUpdateLevel={updateLevel}
                      onRevoke={revokeAccess}
                      loading={loading}
                    />
                  </div>
                  {isOwner && (
                    <ShareWithOrgTab
                      onShare={shareWithOrg}
                      onSuccess={refresh}
                      resourceType="web_site"
                      sharedOrgIds={orgPermissions
                        .map((p) => p.grantedToOrganizationId)
                        .filter((id): id is string => !!id)}
                    />
                  )}
                </>
              )}

              {activeSubTab === "public" && (
                <PublicAccessTab
                  isPublic={resourceIsPublic}
                  publicPermission={publicPermission}
                  isOwner={isOwner}
                  onMakePublic={makePublic}
                  onRevokePublic={() => revokeAccess({ isPublic: true })}
                  resourceType="web_site"
                  resourceId={site.id}
                  resourceName={site.name}
                />
              )}

              {error && (
                <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </main>
  );
}
