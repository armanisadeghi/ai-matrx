"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { getShareableResource } from "@/utils/permissions/registry";
import type { ResourceType } from "@/utils/permissions/registry";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Lock } from "lucide-react";
import { PermissionsList } from "./PermissionsList";
import { ShareWithUserTab } from "./tabs/ShareWithUserTab";
import { ShareWithOrgTab } from "./tabs/ShareWithOrgTab";
import { PublicAccessTab } from "./tabs/PublicAccessTab";
import { getResourceTypeLabel, getResourceSharePath } from "@/utils/permissions/registry";
import { useToast } from "@/components/ui/use-toast";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  /**
   * OPTIONAL override. Leave it out — the modal resolves ownership itself.
   *
   * Only pass this when the caller already holds an authoritative, resolved
   * answer (e.g. it just created the row). Passing a stale or defaulted
   * `false` is what renders this dialog as a dead, empty shell for a user who
   * owns the record.
   */
  isOwner?: boolean;
}

/**
 * ShareModal - Main sharing interface
 *
 * Generic modal that works with ANY resource type.
 * Provides tabs for sharing with users, organizations, or making public.
 *
 * This is the ONE sharing dialog in the app. Do not build a feature-specific
 * variant — extend this one. It self-resolves ownership, so every call site is
 * a three-prop drop-in.
 *
 * @example
 * <ShareModal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   resourceType="workflow"
 *   resourceId={workflowId}
 *   resourceName="My Workflow"
 * />
 */
export function ShareModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
  isOwner: isOwnerOverride,
}: ShareModalProps) {
  const [activeTab, setActiveTab] = useState<
    "users" | "organizations" | "public"
  >("users");
  const [emailingLink, setEmailingLink] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const getShareUrl = () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    return `${baseUrl}${getResourceSharePath(resourceType, resourceId)}`;
  };

  // Email link to self
  const handleEmailLink = async () => {
    setEmailingLink(true);
    try {
      const response = await fetch("/api/sharing/email-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType: getResourceTypeLabel(resourceType),
          resourceName,
          shareUrl: getShareUrl(),
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

  // Ownership is resolved HERE, not trusted from a prop. Callers that pass a
  // defaulted/stale `false` used to silently produce a dialog with no controls.
  const {
    isOwner: resolvedIsOwner,
    loading: ownerLoading,
    error: ownerError,
  } = useIsOwner(resourceType, resourceId);

  const hasOverride = typeof isOwnerOverride === "boolean";
  const isOwner = hasOverride ? isOwnerOverride : resolvedIsOwner;
  const resolvingOwner = !hasOverride && ownerLoading;
  const ownerUnknown = !hasOverride && !ownerLoading && ownerError !== null;

  // A resource type missing from the registry can never share — say so loudly
  // rather than rendering a dialog whose every control silently no-ops.
  const registryEntry = resourceType ? getShareableResource(resourceType) : undefined;
  const configError = !resourceId
    ? "No resource id was supplied to the share dialog."
    : !registryEntry
      ? `"${resourceType}" is not a registered shareable resource. Add it to shareable_resource_registry.`
      : null;

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
  } = useSharing(resourceType, resourceId, isOpen && !configError, resourceName);

  // Filter permissions by type for each tab
  const userPermissions = permissions.filter((p) => p.grantedToUserId);
  const orgPermissions = permissions.filter((p) => p.grantedToOrganizationId);
  const publicPermission = permissions.find((p) => p.isPublic);

  const resourceLabel = getResourceTypeLabel(resourceType);

  /**
   * Shown instead of the grant forms when the caller cannot manage sharing.
   * An empty area with no explanation reads as a broken dialog — say WHY.
   */
  const manageBlockedNotice = ownerUnknown ? (
    <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-destructive">
          Couldn&apos;t confirm who owns this {resourceLabel.toLowerCase()}
        </p>
        <p className="text-xs text-destructive/80 mt-0.5">{ownerError}</p>
      </div>
    </div>
  ) : (
    <div className="p-3 rounded-lg border bg-muted/30 flex items-start gap-2">
      <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium">Only the owner can change sharing</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          This {resourceLabel.toLowerCase()} was shared with you. Ask its owner to
          invite others or change access levels.
        </p>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90dvh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-start justify-between gap-2 pr-10">
            <div className="flex-1 min-w-0">
              <DialogTitle>Share {resourceLabel}</DialogTitle>
              <DialogDescription className="truncate">
                {resourceName}
              </DialogDescription>
            </div>
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
          </div>
        </DialogHeader>

        {/* Misconfigured call site — never render dead controls. */}
        {configError && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 py-10 px-6 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Sharing is unavailable</p>
            <p className="text-xs text-muted-foreground max-w-sm">{configError}</p>
          </div>
        )}

        {/* Resolving ownership — show a skeleton, never the non-owner view. */}
        {!configError && resolvingOwner && (
          <div className="flex-1 space-y-3 py-4" aria-busy="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {!configError && !resolvingOwner && (
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
            <TabsContent value="users" className="mt-0 space-y-3">
              {/* Current user permissions */}
              <div>
                <h3 className="text-sm font-medium mb-2">Current Access</h3>
                <PermissionsList
                  permissions={userPermissions}
                  isOwner={isOwner}
                  onUpdateLevel={updateLevel}
                  onRevoke={revokeAccess}
                  loading={loading}
                />
              </div>

              {/* Add user form */}
              {isOwner ? (
                <ShareWithUserTab
                  onShare={shareWithUser}
                  onSuccess={refresh}
                  resourceType={resourceType}
                  resourceId={resourceId}
                />
              ) : (
                manageBlockedNotice
              )}
            </TabsContent>

            <TabsContent value="organizations" className="mt-0 space-y-3">
              {/* Current org permissions */}
              <div>
                <h3 className="text-sm font-medium mb-2">Current Access</h3>
                <PermissionsList
                  permissions={orgPermissions}
                  isOwner={isOwner}
                  onUpdateLevel={updateLevel}
                  onRevoke={revokeAccess}
                  loading={loading}
                />
              </div>

              {/* Add org form */}
              {isOwner ? (
                <ShareWithOrgTab
                  onShare={shareWithOrg}
                  onSuccess={refresh}
                  resourceType={resourceType}
                  sharedOrgIds={orgPermissions
                    .map((p) => p.grantedToOrganizationId)
                    .filter((id): id is string => !!id)}
                />
              ) : (
                manageBlockedNotice
              )}
            </TabsContent>

            <TabsContent value="public" className="mt-0">
              <PublicAccessTab
                isPublic={resourceIsPublic}
                publicPermission={publicPermission}
                isOwner={isOwner}
                onMakePublic={makePublic}
                onRevokePublic={() => revokeAccess({ isPublic: true })}
                resourceType={resourceType}
                resourceId={resourceId}
                resourceName={resourceName}
              />
            </TabsContent>
          </div>
        </Tabs>
        )}

        {error && (
          <div className="mt-3 p-2.5 bg-destructive/10 border border-destructive/20 rounded-md flex-shrink-0">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
