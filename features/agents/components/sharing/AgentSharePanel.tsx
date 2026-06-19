"use client";

import React, { useState } from "react";
import { Users, Building2, Globe, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSharing } from "@/utils/permissions";
import { PermissionsList } from "@/features/sharing/components/PermissionsList";
import { ShareWithUserTab } from "@/features/sharing/components/tabs/ShareWithUserTab";
import { ShareWithOrgTab } from "@/features/sharing/components/tabs/ShareWithOrgTab";
import { PublicAccessTab } from "@/features/sharing/components/tabs/PublicAccessTab";

type ShareSubTab = "users" | "organizations" | "public";

export interface AgentSharePanelProps {
  agentId: string;
  isOwner: boolean;
  agentName: string;
}

export function AgentSharePanel({
  agentId,
  isOwner,
  agentName,
}: AgentSharePanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<ShareSubTab>("users");

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
  } = useSharing("agent", agentId, true);

  const userPermissions = permissions.filter((p) => p.grantedToUserId);
  const orgPermissions = permissions.filter((p) => p.grantedToOrganizationId);
  const publicPermission = permissions.find((p) => p.isPublic);

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
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-tab strip */}
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
                  resourceType="agent"
                  resourceId={agentId}
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
                  resourceType="agent"
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
              resourceType="agent"
              resourceName={agentName}
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
  );
}
