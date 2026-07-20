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
import { toast } from "@/lib/toast";
import {
  acceptInvitation,
  getOrganization,
} from "@/features/organizations/service";
import { invitationsService } from "@/features/organizations/service/invitationsService";
import { membershipsService } from "@/features/organizations/service/membershipsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type {
  Organization,
  OrganizationInvitationWithOrg,
  OrgRole,
} from "@/features/organizations/types";
import { supabase } from "@/utils/supabase/client";
import { InlineMediaRef, fileIdToMediaRef } from "@/features/files";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

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
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(
          `/login?redirectTo=${encodeURIComponent(`/invitations/organization/accept/${token}`)}`,
        );
        return;
      }

      // Canonical chokepoint — `inv_get_by_token` is gated to the invited party,
      // so it returns the invite even before a membership exists.
      const inviteResult = await invitationsService.getByToken(token);
      if (isScopesRpcErr(inviteResult)) {
        setError("Invitation not found or has already been used");
        return;
      }

      const invitationData = inviteResult.data.invitation;
      if (!invitationData || invitationData.targetType !== "organization") {
        setError("Invitation not found or has already been used");
        return;
      }

      if (new Date(invitationData.expiresAt) <= new Date()) {
        setError("This invitation has expired");
        return;
      }

      if (invitationData.email.toLowerCase() !== user.email?.toLowerCase()) {
        setError(
          `This invitation is for ${invitationData.email}. Please sign in with that email address.`,
        );
        return;
      }

      // Check if user is already a member — canonical membership read
      const myOrgsResult = await membershipsService.forUser("organization");
      const alreadyMember = !myOrgsResult.ok
        ? false
        : myOrgsResult.data.memberships.some(
            (m) => m.containerId === invitationData.targetId,
          );

      if (alreadyMember) {
        setError("You are already a member of this organization");
        return;
      }

      // Org row is RLS-hidden to a not-yet-member invitee. Prefer the
      // target_name from inv_get_by_token; fall back to getOrganization when
      // readable (e.g. already a member of a sibling path).
      const orgFromRpc: Organization | undefined = invitationData.targetName
        ? {
            id: invitationData.targetId,
            name: invitationData.targetName,
            slug: "",
            createdAt: "",
            updatedAt: "",
            isPersonal: false,
          }
        : undefined;
      const organization =
        (await getOrganization(invitationData.targetId)) ?? orgFromRpc;

      const transformedInvitation: OrganizationInvitationWithOrg = {
        id: invitationData.id,
        organizationId: invitationData.targetId,
        email: invitationData.email,
        token,
        role: invitationData.role as OrgRole,
        invitedAt: invitationData.createdAt,
        invitedBy: invitationData.createdBy,
        expiresAt: invitationData.expiresAt,
        organization,
      };

      setInvitation(transformedInvitation);
    } catch (err) {
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
    } catch (err) {
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

  const header = (
    <PageHeader>
      <div className="flex items-center w-full min-w-0 gap-0 p-0">
        <ChevronLeftTapButton
          onClick={() => router.back()}
          variant="transparent"
          ariaLabel="Back"
        />
        <h1 className="ml-2 text-sm font-medium text-foreground truncate">
          Organization Invite
        </h1>
      </div>
    </PageHeader>
  );

  // Loading state
  if (loading) {
    return (
      <>
        {header}
        <div className="h-full overflow-y-auto bg-textured flex items-center justify-center p-4">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              Loading invitation...
            </p>
          </div>
        </div>
      </>
    );
  }

  // Error state
  if (error || !invitation) {
    return (
      <>
        {header}
        <div className="h-full overflow-y-auto bg-textured flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Unable to Accept Invitation
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {error || "Invitation not found"}
              </p>
              <Button
                onClick={() => router.push("/settings/organizations")}
                variant="outline"
              >
                Go to Organizations
              </Button>
            </div>
          </Card>
        </div>
      </>
    );
  }

  // Success state - show invitation details
  return (
    <>
      {header}
      <div className="h-full overflow-y-auto bg-textured flex items-center justify-center p-4">
      <Card className="max-w-lg w-full p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
            {invitation.organization?.logoUrl ||
            invitation.organization?.logoFileId ? (
              <InlineMediaRef
                ref={
                  invitation.organization.logoFileId
                    ? fileIdToMediaRef(invitation.organization.logoFileId)
                    : invitation.organization.logoUrl
                }
                size="md"
                fit="cover"
                rounded="full"
                alt={invitation.organization.name}
                className="w-16 h-16"
              />
            ) : (
              <Building2 className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            You&apos;re Invited!
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Join{" "}
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {invitation.organization?.name ?? "the organization"}
            </span>
          </p>
        </div>

        {/* Invitation Details */}
        <div className="space-y-4 mb-6">
          {invitation.organization?.description && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {invitation.organization.description}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <Mail className="h-5 w-5 text-gray-400" />
            <div className="flex-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Invited as
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {invitation.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <UserPlus className="h-5 w-5 text-gray-400" />
            <div className="flex-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">Role</p>
              <Badge variant="secondary" className="mt-1 capitalize">
                {invitation.role}
              </Badge>
            </div>
          </div>

          <div className="text-xs text-center text-gray-500 dark:text-gray-400">
            Expires{" "}
            {new Date(invitation.expiresAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleDecline}
            variant="outline"
            className="flex-1"
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
            className="flex-1"
            disabled={accepting || declining}
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
      </Card>
      </div>
    </>
  );
}
