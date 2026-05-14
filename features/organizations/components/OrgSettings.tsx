"use client";

import React, { useEffect, useState } from "react";
import {
  Settings,
  Users,
  Mail,
  AlertTriangle,
  Send,
  FolderTree,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Organization, OrgRole } from "../types";
import { GeneralSettings } from "./GeneralSettings";
import { MemberManagement } from "./MemberManagement";
import { InvitationManager } from "./InvitationManager";
import { DangerZone } from "./DangerZone";
import { OrgEmailTab } from "./OrgEmailTab";
import { ScopesGrid } from "@/features/scope-system/components/ScopesGrid";

interface OrgSettingsProps {
  organization: Organization;
  userRole: OrgRole;
  isOwner: boolean;
  isAdmin: boolean;
}

/**
 * OrgSettings - Main settings component with tabbed interface
 *
 * Tabs:
 * - General: Edit org details (admin/owner)
 * - Members: Manage team members (admin/owner)
 * - Invitations: Send/manage invites (admin/owner)
 * - Danger Zone: Delete org (owner only)
 *
 * Features:
 * - Permission-based tab visibility
 * - Tab state management
 * - Responsive design
 */
export function OrgSettings({
  organization,
  userRole,
  isOwner,
  isAdmin,
}: OrgSettingsProps) {
  const [activeTab, setActiveTab] = useState("general");
  const [displayOrganization, setDisplayOrganization] =
    useState<Organization>(organization);

  useEffect(() => {
    setDisplayOrganization(organization);
  }, [organization]);

  // Determine which tabs are available based on permissions
  const canManageSettings = isOwner || isAdmin;
  const canManageMembers = isOwner || isAdmin;
  const canDelete = isOwner && !displayOrganization.isPersonal;

  const orgSettingsTabTriggerClass =
    "h-6 gap-1.5 rounded-none px-2.5 py-0 text-xs min-w-0 shadow-none data-[state=active]:shadow-none data-[state=active]:rounded-none";

  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4 h-auto min-h-0 w-full justify-start gap-0 rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger value="general" className={orgSettingsTabTriggerClass}>
            <Settings className="h-3.5 w-3.5 shrink-0" />
            General
          </TabsTrigger>

          {canManageMembers && (
            <TabsTrigger value="members" className={orgSettingsTabTriggerClass}>
              <Users className="h-3.5 w-3.5 shrink-0" />
              Members
            </TabsTrigger>
          )}

          {canManageSettings && (
            <TabsTrigger
              value="scopes"
              className={orgSettingsTabTriggerClass}
            >
              <FolderTree className="h-3.5 w-3.5 shrink-0" />
              Scopes
            </TabsTrigger>
          )}

          {canManageSettings && (
            <TabsTrigger
              value="invitations"
              className={orgSettingsTabTriggerClass}
            >
              <Mail className="h-3.5 w-3.5 shrink-0" />
              Invites
            </TabsTrigger>
          )}

          {canManageMembers && (
            <TabsTrigger value="email" className={orgSettingsTabTriggerClass}>
              <Send className="h-3.5 w-3.5 shrink-0" />
              Email
            </TabsTrigger>
          )}

          {canDelete && (
            <TabsTrigger
              value="danger"
              className={`${orgSettingsTabTriggerClass} text-red-600 dark:text-red-400 data-[state=active]:text-red-600`}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Danger
            </TabsTrigger>
          )}
        </TabsList>

        {/* General Settings Tab */}
        <TabsContent value="general">
          <GeneralSettings
            organization={displayOrganization}
            canEdit={canManageSettings}
            userRole={userRole}
            onOrganizationUpdated={setDisplayOrganization}
          />
        </TabsContent>

        {/* Members Tab */}
        {canManageMembers && (
          <TabsContent value="members">
            <MemberManagement
              organizationId={displayOrganization.id}
              userRole={userRole}
              isOwner={isOwner}
              isPersonal={displayOrganization.isPersonal}
            />
          </TabsContent>
        )}

        {/* Scopes Tab */}
        {canManageSettings && (
          <TabsContent value="scopes">
            <ScopesGrid
              orgId={displayOrganization.id}
              orgSlugOrId={displayOrganization.slug ?? displayOrganization.id}
            />
          </TabsContent>
        )}

        {/* Invitations Tab */}
        {canManageSettings && (
          <TabsContent value="invitations">
            <InvitationManager
              organizationId={displayOrganization.id}
              organizationName={displayOrganization.name}
              userRole={userRole}
            />
          </TabsContent>
        )}

        {/* Email Tab */}
        {canManageMembers && (
          <TabsContent value="email">
            <OrgEmailTab
              organizationId={displayOrganization.id}
              organizationName={displayOrganization.name}
            />
          </TabsContent>
        )}

        {/* Danger Zone Tab */}
        {canDelete && (
          <TabsContent value="danger">
            <DangerZone organization={displayOrganization} />
          </TabsContent>
        )}
      </Tabs>

      {/* Read-only notice for members */}
      {!canManageSettings && activeTab === "general" && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            View-only access. Contact an admin to make changes.
          </p>
        </div>
      )}
    </div>
  );
}
