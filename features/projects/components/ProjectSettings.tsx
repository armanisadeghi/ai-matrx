'use client';

import React, { useState } from 'react';
import { Settings, Users, Mail, AlertTriangle } from 'lucide-react';
import { Tabs, TabsContent, TabsListLegacy as TabsList, TabsTriggerLegacy as TabsTrigger } from '@/components/ui/tabs';
import type { Project, ProjectRole } from '../types';
import { GeneralSettings } from './GeneralSettings';
import { MemberManagement } from './MemberManagement';
import { InvitationManager } from './InvitationManager';
import { DangerZone } from './DangerZone';

interface ProjectSettingsProps {
  project: Project;
  userRole: ProjectRole;
  isOwner: boolean;
  isAdmin: boolean;
  orgSlug?: string | null;
}

export function ProjectSettings({
  project,
  userRole,
  isOwner,
  isAdmin,
  orgSlug,
}: ProjectSettingsProps) {
  const [activeTab, setActiveTab] = useState('general');

  const canManageSettings = isOwner || isAdmin;
  const canManageMembers = isOwner || isAdmin;
  const canDelete = isOwner;

  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start gap-1 h-auto p-1 mb-4">
          <TabsTrigger value="general" className="gap-1.5 px-3 py-1.5 text-sm">
            <Settings className="h-3.5 w-3.5" />
            General
          </TabsTrigger>

          {canManageMembers && (
            <TabsTrigger value="members" className="gap-1.5 px-3 py-1.5 text-sm">
              <Users className="h-3.5 w-3.5" />
              Members
            </TabsTrigger>
          )}

          {canManageSettings && (
            <TabsTrigger value="invitations" className="gap-1.5 px-3 py-1.5 text-sm">
              <Mail className="h-3.5 w-3.5" />
              Invites
            </TabsTrigger>
          )}

          {canDelete && (
            <TabsTrigger
              value="danger"
              className="gap-1.5 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 data-[state=active]:text-red-600"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Danger
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="general">
          <GeneralSettings project={project} canEdit={canManageSettings} userRole={userRole} />
        </TabsContent>

        {canManageMembers && (
          <TabsContent value="members">
            <MemberManagement projectId={project.id} userRole={userRole} isOwner={isOwner} />
          </TabsContent>
        )}

        {canManageSettings && (
          <TabsContent value="invitations">
            <InvitationManager
              projectId={project.id}
              projectName={project.name}
              userRole={userRole}
            />
          </TabsContent>
        )}

        {canDelete && (
          <TabsContent value="danger">
            <DangerZone project={project} orgSlug={orgSlug} />
          </TabsContent>
        )}
      </Tabs>

      {!canManageSettings && activeTab === 'general' && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            View-only access. Contact an admin to make changes.
          </p>
        </div>
      )}
    </div>
  );
}
