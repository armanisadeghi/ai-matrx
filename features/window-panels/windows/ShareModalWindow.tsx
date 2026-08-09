"use client";

import React, { useCallback, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Users,
  Building2,
  Globe,
  Mail,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { useSharing, useIsOwner } from "@/utils/permissions/hooks";
import {
  getResourceSharePath,
  getResourceTypeLabel,
} from "@/utils/permissions/registry";
import type { ResourceType } from "@/utils/permissions/types";
import { PermissionsList } from "@/features/sharing/components/PermissionsList";
import { ShareWithUserTab } from "@/features/sharing/components/tabs/ShareWithUserTab";
import { ShareWithOrgTab } from "@/features/sharing/components/tabs/ShareWithOrgTab";
import { PublicAccessTab } from "@/features/sharing/components/tabs/PublicAccessTab";
import { useToast } from "@/components/ui/use-toast";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  SHARE_SURFACE_NAME,
  createShareScope,
} from "@/features/surfaces/manifests/share.manifest";

export interface ShareModalWindowProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
}

export default function ShareModalWindow({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
}: ShareModalWindowProps) {
  const [activeTab, setActiveTab] = useState<
    "users" | "organizations" | "public"
  >("users");
  const [emailingLink, setEmailingLink] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();
  const { isOwner, loading: ownerLoading } = useIsOwner(
    resourceType,
    resourceId,
  );
  const collectData = useCallback(
    () => ({ resourceType, resourceId, resourceName }),
    [resourceId, resourceName, resourceType],
  );

  /**
   * A share URL is the highest-stakes door we build: the user sends it to
   * someone else, and a 404 lands in a stranger's inbox. `getResourceSharePath`
   * is the ONE resolver (entity registry first, share-registry template as
   * fallback, no guessing) and returns null when the resource genuinely has no
   * page — which we say out loud rather than emailing a broken link.
   */
  const getShareUrl = (): string | null => {
    const path = getResourceSharePath(resourceType, resourceId);
    if (!path) return null;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    return `${baseUrl}${path}`;
  };

  const handleEmailLink = async () => {
    const shareUrl = getShareUrl();
    if (!shareUrl) {
      // Never email a link we can't build — a broken URL in someone else's
      // inbox is the worst possible dead end.
      toast({
        title: "No shareable link for this item yet",
        description: `"${getResourceTypeLabel(resourceType)}" has no page to open. Sharing access still works; only the emailed link is unavailable.`,
        variant: "destructive",
      });
      return;
    }
    setEmailingLink(true);
    try {
      const response = await fetch("/api/sharing/email-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType: getResourceTypeLabel(resourceType),
          resourceName,
          shareUrl,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setEmailSent(true);
        toast({
          title: "Email sent",
          description: "Link has been emailed to you",
        });
        setTimeout(() => setEmailSent(false), 3000);
      } else {
        toast({
          title: "Failed to send email",
          description: data.msg || "Please try again",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send email",
        variant: "destructive",
      });
    } finally {
      setEmailingLink(false);
    }
  };

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
  } = useSharing(resourceType, resourceId, isOpen);

  const userPermissions = permissions.filter((p) => p.grantedToUserId);
  const orgPermissions = permissions.filter((p) => p.grantedToOrganizationId);
  const publicPermission = permissions.find((p) => p.isPublic);

  const resourceLabel = getResourceTypeLabel(resourceType);

  if (!isOpen) return null;

  return (
    <WindowPanel
      titleNode={
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium leading-tight">
            {resourceName}
          </span>
          <span className="truncate text-[11px] leading-tight text-muted-foreground">
            Manage {resourceLabel.toLowerCase()} access
          </span>
        </div>
      }
      actionsRight={
        <Button
          variant="outline"
          size="sm"
          onClick={handleEmailLink}
          disabled={emailingLink}
          className="flex-shrink-0"
        >
          {emailingLink ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : emailSent ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <Mail className="h-4 w-4" />
          )}
          <span className="ml-1.5 hidden sm:inline">
            {emailSent ? "Sent!" : "Email link"}
          </span>
        </Button>
      }
      width={650}
      height={500}
      onClose={onClose}
      overlayId="shareModalWindow"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onCollectData={collectData}
    >
      {/* Nested overlay emitter — while this window is open, its scope
          out-depths the page's provider (deepest wins). */}
      <SurfaceRuntimeProvider
        surfaceName={SHARE_SURFACE_NAME}
        getScope={() =>
          createShareScope({
            resource_type: resourceType,
            resource_id: resourceId,
            resource_name: resourceName ?? "Untitled resource",
            share_url: getShareUrl() ?? "",
            active_tab: activeTab,
            is_owner: ownerLoading ? undefined : isOwner,
            is_public: loading ? undefined : resourceIsPublic,
            user_grant_count: loading ? undefined : userPermissions.length,
            org_grant_count: loading ? undefined : orgPermissions.length,
            permissions: loading
              ? undefined
              : permissions.map((p) => ({ ...p })),
          })
        }
        isEditable={false}
      >
      <div className="flex flex-col h-full bg-background overflow-hidden p-4">
        {/* Tabs Section */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as typeof activeTab)}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
            <TabsTrigger value="users" className="gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Users</span>
              {userPermissions.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/10 rounded-full">
                  {userPermissions.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="organizations" className="gap-2">
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">Organizations</span>
              {orgPermissions.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/10 rounded-full">
                  {orgPermissions.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="public" className="gap-2">
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">Public</span>
              {publicPermission && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-green-500/10 rounded-full">
                  •
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 mt-3 min-h-0 overflow-y-auto">
            <TabsContent value="users" className="mt-0 space-y-3 pb-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Current Access</h3>
                <PermissionsList
                  permissions={userPermissions}
                  isOwner={isOwner && !ownerLoading}
                  onUpdateLevel={updateLevel}
                  onRevoke={revokeAccess}
                  loading={loading}
                />
              </div>

              {isOwner && !ownerLoading && (
                <ShareWithUserTab
                  onShare={shareWithUser}
                  onSuccess={refresh}
                  resourceType={resourceType}
                  resourceId={resourceId}
                />
              )}
            </TabsContent>

            <TabsContent value="organizations" className="mt-0 space-y-3 pb-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Current Access</h3>
                <PermissionsList
                  permissions={orgPermissions}
                  isOwner={isOwner && !ownerLoading}
                  onUpdateLevel={updateLevel}
                  onRevoke={revokeAccess}
                  loading={loading}
                />
              </div>

              {isOwner && !ownerLoading && (
                <ShareWithOrgTab
                  onShare={shareWithOrg}
                  onSuccess={refresh}
                  resourceType={resourceType}
                  sharedOrgIds={orgPermissions
                    .map((p) => p.grantedToOrganizationId)
                    .filter((id): id is string => !!id)}
                />
              )}
            </TabsContent>

            <TabsContent value="public" className="mt-0 pb-4">
              <PublicAccessTab
                isPublic={resourceIsPublic}
                publicPermission={publicPermission}
                isOwner={isOwner && !ownerLoading}
                onMakePublic={makePublic}
                onRevokePublic={() => revokeAccess({ isPublic: true })}
                resourceType={resourceType}
                resourceId={resourceId}
                resourceName={resourceName}
              />
            </TabsContent>
          </div>
        </Tabs>

        {error && (
          <div className="mt-3 p-2.5 bg-destructive/10 border border-destructive/20 rounded-md flex-shrink-0">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </div>
      </SurfaceRuntimeProvider>
    </WindowPanel>
  );
}
