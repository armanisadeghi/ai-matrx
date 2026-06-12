"use client";

import React, { useState } from "react";
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
import { useSharing, useIsOwner, useSharingStatus } from "@/utils/permissions";
import type { ResourceType } from "@/utils/permissions";
import { PermissionsList } from "@/features/sharing/components/PermissionsList";
import { ShareWithUserTab } from "@/features/sharing/components/tabs/ShareWithUserTab";
import { ShareWithOrgTab } from "@/features/sharing/components/tabs/ShareWithOrgTab";
import { PublicAccessTab } from "@/features/sharing/components/tabs/PublicAccessTab";
import { getResourceTypeLabel } from "@/utils/permissions";
import { useToast } from "@/components/ui/use-toast";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

export interface ShareModalWindowProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  isOwner: boolean;
}

export default function ShareModalWindow({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
  isOwner,
}: ShareModalWindowProps) {
  const [activeTab, setActiveTab] = useState<
    "users" | "organizations" | "public"
  >("users");
  const [emailingLink, setEmailingLink] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const getShareUrl = () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const resourcePaths: Record<string, string> = {
      canvas: `/canvas/${resourceId}`,
      prompt: `/ai/prompts/edit/${resourceId}`,
      collection: `/collections/${resourceId}`,
      workflow: `/workflows/${resourceId}`,
      note: `/notes/${resourceId}`,
      task: `/tasks/${resourceId}`,
      tasks: `/tasks/${resourceId}`,
      cx_conversation: `/chat/${resourceId}`,
      canvas_items: `/canvas/${resourceId}`,
      udt_datasets: `/data/${resourceId}`,
      udt_picklists: `/lists/${resourceId}`,
      transcripts: `/transcripts/${resourceId}`,
      quiz_sessions: `/quizzes/${resourceId}`,
      sandbox_instances: `/sandbox/${resourceId}`,
      user_files: `/files/${resourceId}`,
      prompt_actions: `/ai/prompts/actions/${resourceId}`,
      flashcard_data: `/flashcards/${resourceId}`,
      flashcard_sets: `/flashcards/sets/${resourceId}`,
    };
    const path =
      resourcePaths[resourceType] || `/${resourceType}/${resourceId}`;
    return `${baseUrl}${path}`;
  };

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

  const {
    permissions,
    loading,
    error,
    shareWithUser,
    shareWithOrg,
    makePublic,
    revokeAccess,
    updateLevel,
    refresh,
  } = useSharing(resourceType, resourceId, isOpen);

  const { isPublic: resourceIsPublic } = useSharingStatus(
    resourceType,
    resourceId,
  );

  const userPermissions = permissions.filter((p) => p.grantedToUserId);
  const orgPermissions = permissions.filter((p) => p.grantedToOrganizationId);
  const publicPermission = permissions.find((p) => p.isPublic);

  const resourceLabel = getResourceTypeLabel(resourceType);

  if (!isOpen) return null;

  return (
    <WindowPanel
      title={`Share ${resourceLabel}`}
      width={650}
      height={500}
      urlSyncKey="share_modal"
      onClose={onClose}
      overlayId="shareModalWindow"
      onCollectData={() => ({
        resourceType,
        resourceId,
        resourceName,
        isOwner,
      })}
    >
      <div className="flex flex-col h-full bg-background overflow-hidden p-4">
        {/* Header Section */}
        <div className="flex items-start justify-between gap-4 mb-4 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate">{resourceName}</h2>
            <p className="text-sm text-muted-foreground">
              Manage access and permissions
            </p>
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
                isOwner={isOwner}
                onMakePublic={makePublic}
                onRevokePublic={() => revokeAccess({ isPublic: true })}
                resourceType={resourceType}
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
    </WindowPanel>
  );
}
