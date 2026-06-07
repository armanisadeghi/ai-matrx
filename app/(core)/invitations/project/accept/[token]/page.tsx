'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Check, X, AlertCircle, Loader2, Puzzle, Mail, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { acceptProjectInvitation } from '@/features/projects/service';
import { supabase } from '@/utils/supabase/client';
import type { ProjectInvitation, Project } from '@/features/projects/types';

type InvitationWithProject = ProjectInvitation & { project: Project };

/**
 * Accept Project Invitation Page
 * Route: /invitations/project/accept/[token]
 */
export default function AcceptProjectInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [invitation, setInvitation] = useState<InvitationWithProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInvitation();
  }, [token]);

  const loadInvitation = async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(`/login?redirectTo=${encodeURIComponent(`/invitations/project/accept/${token}`)}`);
        return;
      }

      const { data: invitationData, error: inviteError } = await supabase
        .from('ctx_project_invitations')
        .select('*')
        .eq('token', token)
        .single();

      if (inviteError || !invitationData) {
        setError('Invitation not found or has already been used');
        return;
      }

      if (new Date(invitationData.expires_at) <= new Date()) {
        setError('This invitation has expired');
        return;
      }

      if (invitationData.email.toLowerCase() !== user.email?.toLowerCase()) {
        setError(
          `This invitation is for ${invitationData.email}. Please sign in with that email address.`
        );
        return;
      }

      const { data: memberData } = await supabase
        .from('ctx_project_members')
        .select('id')
        .eq('project_id', invitationData.project_id)
        .eq('user_id', user.id)
        .single();

      if (memberData) {
        setError('You are already a member of this project');
        return;
      }

      const { data: projectData, error: projectError } = await supabase
        .from('ctx_projects')
        .select('*, organizations(is_personal)')
        .eq('id', invitationData.project_id)
        .single();

      if (projectError || !projectData) {
        setError('Project not found');
        return;
      }

      const transformedInvitation: InvitationWithProject = {
        id: invitationData.id,
        projectId: invitationData.project_id,
        email: invitationData.email,
        token: invitationData.token,
        role: invitationData.role,
        invitedAt: invitationData.invited_at,
        invitedBy: invitationData.invited_by,
        expiresAt: invitationData.expires_at,
        project: {
          id: projectData.id,
          name: projectData.name,
          slug: projectData.slug,
          description: projectData.description,
          organizationId: projectData.organization_id,
          createdBy: projectData.created_by,
          // Personal-ness is org-derived; ctx_projects no longer stores it.
          isPersonal: projectData.organizations?.is_personal ?? false,
          settings: projectData.settings,
          createdAt: projectData.created_at,
          updatedAt: projectData.updated_at,
        },
      };

      setInvitation(transformedInvitation);
    } catch (err: unknown) {
      console.error('Error loading project invitation:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!invitation) return;
    setAccepting(true);

    try {
      const result = await acceptProjectInvitation(token);
      if (result.success && result.project) {
        toast.success(`Welcome to ${result.project.name}!`);
        // Navigate to the project — need org slug, fall back to settings/projects
        router.push('/settings/projects');
      } else {
        toast.error(result.error ?? 'Failed to accept invitation');
        setError(result.error ?? 'Failed to accept invitation');
      }
    } catch (err: unknown) {
      console.error('Error accepting project invitation:', err);
      toast.error('An unexpected error occurred');
      setError('An unexpected error occurred');
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = () => {
    setDeclining(true);
    toast.info('Invitation declined');
    setTimeout(() => {
      router.push('/settings/projects');
    }, 1000);
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100dvh-var(--header-height))] bg-textured flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-500 mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-[calc(100dvh-var(--header-height))] bg-textured flex items-center justify-center p-4">
        <Card className="max-w-lg w-full p-8 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-800 mb-2">
              <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-300" />
            </div>
            <h2 className="text-2xl font-bold text-red-900 dark:text-red-100">Invalid Invitation</h2>
            <p className="text-red-700 dark:text-red-300">{error}</p>
            <div className="flex gap-3 justify-center pt-4">
              <Button onClick={() => router.push('/settings/projects')} variant="outline">
                My Projects
              </Button>
              <Button onClick={() => router.push('/dashboard')}>Dashboard</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-var(--header-height))] bg-textured flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full p-8">
        <div className="text-center space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 mb-4">
            <Mail className="h-10 w-10 text-white" />
          </div>

          <div>
            <h1 className="text-3xl font-bold mb-2">You're Invited!</h1>
            <p className="text-muted-foreground">You've been invited to join a project</p>
          </div>

          <Card className="p-6 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-indigo-200 dark:border-indigo-800">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center border border-indigo-200 dark:border-indigo-800">
                <Puzzle className="h-7 w-7 text-indigo-600 dark:text-indigo-300" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-xl font-semibold mb-1">{invitation.project.name}</h3>
                {invitation.project.description && (
                  <p className="text-sm text-muted-foreground mb-3">{invitation.project.description}</p>
                )}
                <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                  <UserPlus className="h-3 w-3 mr-1" />
                  Join as {invitation.role}
                </Badge>
              </div>
            </div>
          </Card>

          <div className="text-left space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>Invited to:</strong> {invitation.email}
            </p>
            <p>
              <strong>Role:</strong> {invitation.role}
            </p>
            <p>
              <strong>Expires:</strong> {new Date(invitation.expiresAt).toLocaleDateString()}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Button
              onClick={handleDecline}
              variant="outline"
              size="lg"
              disabled={accepting || declining}
            >
              {declining ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Declining...
                </>
              ) : (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Decline
                </>
              )}
            </Button>
            <Button
              onClick={handleAccept}
              size="lg"
              disabled={accepting || declining}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {accepting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Accepting...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Accept Invitation
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground pt-2">
            By accepting, you will gain access to {invitation.project.name} and its shared
            resources.
          </p>
        </div>
      </Card>
    </div>
  );
}
