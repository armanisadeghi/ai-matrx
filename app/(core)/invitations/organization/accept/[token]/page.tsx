"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Check,
  X,
  AlertCircle,
  Loader2,
  Building2,
  Mail,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { acceptInvitation } from "@/features/organizations/service";
import type { OrganizationInvitationWithOrg } from "@/features/organizations/types";
import { supabase } from "@/utils/supabase/client";
import { InlineMediaRef } from "@/features/files";

/**
 * Accept Invitation Page
 *
 * Route: /invitations/organization/accept/[token]
 *
 * Features:
 * - Validates invitation token
 * - Shows invitation details
 * - Accept/decline actions
 * - Error handling for invalid/expired invitations
 * - Redirects to organization after accepting
 */
export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [invitation, setInvitation] =
    useState<OrganizationInvitationWithOrg | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load invitation details
  useEffect(() => {
    loadInvitation();
  }, [token]);

  const loadInvitation = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log(
        "[Invitation] Starting to load invitation with token:",
        token,
      );

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      console.log("[Invitation] Auth check:", {
        userId: user?.id,
        userEmail: user?.email,
        authError: authError?.message,
      });

      if (!user) {
        // Not logged in - redirect to login with return URL
        console.log("[Invitation] No user, redirecting to login");
        router.push(
          `/login?redirectTo=${encodeURIComponent(`/invitations/organization/accept/${token}`)}`,
        );
        return;
      }

      // First, try to fetch just the invitation without join
      console.log("[Invitation] Fetching invitation without join...");
      const { data: invitationOnly, error: inviteOnlyError } = await supabase
        .from("organization_invitations")
        .select("*")
        .eq("token", token)
        .single();

      console.log("[Invitation] Invitation-only result:", {
        found: !!invitationOnly,
        error: inviteOnlyError?.message,
        errorCode: inviteOnlyError?.code,
        errorDetails: inviteOnlyError?.details,
        invitationId: invitationOnly?.id,
        invitationEmail: invitationOnly?.email,
        expiresAt: invitationOnly?.expires_at,
      });

      if (inviteOnlyError) {
        console.error(
          "[Invitation] Failed to fetch invitation:",
          inviteOnlyError,
        );
        setError(`Failed to fetch invitation: ${inviteOnlyError.message}`);
        return;
      }

      if (!invitationOnly) {
        console.log("[Invitation] No invitation found for token");
        setError("Invitation not found");
        return;
      }

      // Check expiry manually
      const isExpired = new Date(invitationOnly.expires_at) <= new Date();
      console.log("[Invitation] Expiry check:", {
        expiresAt: invitationOnly.expires_at,
        now: new Date().toISOString(),
        isExpired,
      });

      if (isExpired) {
        setError("This invitation has expired");
        return;
      }

      // Now fetch the organization separately
      console.log(
        "[Invitation] Fetching organization:",
        invitationOnly.organization_id,
      );
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", invitationOnly.organization_id)
        .single();

      console.log("[Invitation] Organization result:", {
        found: !!orgData,
        error: orgError?.message,
        errorCode: orgError?.code,
        orgName: orgData?.name,
      });

      if (orgError || !orgData) {
        console.error("[Invitation] Failed to fetch organization:", orgError);
        // Continue anyway with partial data - we can show the invitation
        // but maybe not all org details
      }

      const data = { ...invitationOnly, organizations: orgData };

      if (!data) {
        setError("Invitation not found or has expired");
        return;
      }

      // Check if invitation is for current user's email
      if (data.email.toLowerCase() !== user.email?.toLowerCase()) {
        setError(
          `This invitation is for ${data.email}. Please sign in with that email address.`,
        );
        return;
      }

      // Check if user is already a member
      const { data: memberData } = await supabase
        .from("organization_members")
        .select("id")
        .eq("organization_id", data.organization_id)
        .eq("user_id", user.id)
        .single();

      if (memberData) {
        setError("You are already a member of this organization");
        return;
      }

      // Transform invitation data
      const transformedInvitation: OrganizationInvitationWithOrg = {
        id: data.id,
        organizationId: data.organization_id,
        email: data.email,
        token: data.token,
        role: data.role,
        invitedAt: data.invited_at,
        invitedBy: data.invited_by,
        expiresAt: data.expires_at,
        organization: {
          id: data.organizations.id,
          name: data.organizations.name,
          slug: data.organizations.slug,
          description: data.organizations.description,
          logoUrl: data.organizations.logo_url,
          website: data.organizations.website,
          createdAt: data.organizations.created_at,
          updatedAt: data.organizations.updated_at,
          createdBy: data.organizations.created_by,
          isPersonal: data.organizations.is_personal,
          settings: data.organizations.settings,
        },
      };

      setInvitation(transformedInvitation);
    } catch (err: any) {
      console.error("Error loading invitation:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Handle accept invitation
  const handleAccept = async () => {
    if (!invitation) return;

    setAccepting(true);

    try {
      const result = await acceptInvitation(token);

      if (result.success && result.organization) {
        toast.success(`Welcome to ${result.organization.name}!`);
        router.push(`/organizations/${result.organization.id}/settings`);
      } else {
        toast.error(result.error || "Failed to accept invitation");
        setError(result.error || "Failed to accept invitation");
      }
    } catch (err: any) {
      console.error("Error accepting invitation:", err);
      toast.error("An unexpected error occurred");
      setError("An unexpected error occurred");
    } finally {
      setAccepting(false);
    }
  };

  // Handle decline invitation
  const handleDecline = () => {
    setDeclining(true);
    toast.info("Invitation declined");
    setTimeout(() => {
      router.push("/settings/organizations");
    }, 1000);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-textured flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">Loading invitation...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !invitation) {
    return (
      <div className="min-h-screen bg-textured flex items-center justify-center p-4">
        <Card className="max-w-lg w-full p-8 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-800 mb-2">
              <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-300" />
            </div>
            <h2 className="text-2xl font-bold text-red-900 dark:text-red-100">
              Invalid Invitation
            </h2>
            <p className="text-red-700 dark:text-red-300">{error}</p>
            <div className="flex gap-3 justify-center pt-4">
              <Button
                onClick={() => router.push("/settings/organizations")}
                variant="outline"
              >
                Go to Organizations
              </Button>
              <Button onClick={() => router.push("/dashboard")}>
                Go to Dashboard
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Success state - show invitation details
  return (
    <div className="min-h-screen bg-textured flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full p-8">
        <div className="text-center space-y-6">
          {/* Success Icon */}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 mb-4">
            <Mail className="h-10 w-10 text-white" />
          </div>

          {/* Title */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              You're Invited!
            </h1>
            <p className="text-muted-foreground">
              You've been invited to join an organization
            </p>
          </div>

          {/* Organization Details */}
          <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-4">
              {/* Logo */}
              <div className="flex-shrink-0">
                <InlineMediaRef
                  ref={invitation.organization.logoUrl ?? null}
                  size={{ width: 64, height: 64 }}
                  fit="cover"
                  rounded="lg"
                  border="subtle"
                  fallbackIcon={<Building2 className="h-8 w-8 text-blue-600 dark:text-blue-300" />}
                  className="bg-blue-100 dark:bg-blue-900"
                  alt={invitation.organization.name}
                />
              </div>

              {/* Info */}
              <div className="flex-1 text-left">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  {invitation.organization.name}
                </h3>
                {invitation.organization.description && (
                  <p className="text-sm text-muted-foreground mb-3">
                    {invitation.organization.description}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    <UserPlus className="h-3 w-3" />
                    Join as {invitation.role}
                  </Badge>
                  {invitation.organization.website && (
                    <a
                      href={invitation.organization.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      Visit website
                    </a>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Invitation Details */}
          <div className="text-left space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>Invited to:</strong> {invitation.email}
            </p>
            <p>
              <strong>Role:</strong> {invitation.role}
            </p>
            <p>
              <strong>Expires:</strong>{" "}
              {new Date(invitation.expiresAt).toLocaleDateString()}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Button
              onClick={handleDecline}
              variant="outline"
              size="lg"
              disabled={accepting || declining}
              className="sm:order-1"
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
              className="bg-blue-500 hover:bg-blue-600 sm:order-2"
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

          {/* Note */}
          <p className="text-xs text-muted-foreground pt-4">
            By accepting, you agree to join {invitation.organization.name} and
            will gain access to shared resources.
          </p>
        </div>
      </Card>
    </div>
  );
}
