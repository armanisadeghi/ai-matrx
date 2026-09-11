"use client";

/**
 * InvitationManager — organization wrapper around the shared <InvitationsPanel />.
 *
 * Fetches org invitations + the user's contacts (for quick-select) with the org
 * hooks and supplies the org accept-URL builder. All UI lives in the shared
 * panel. See components/membership/InvitationsPanel.tsx.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { useOrganizationInvitations, useInvitationOperations } from "../hooks";
import type { OrgRole } from "../types";
import { useUserConnections } from "@/features/messaging/hooks/useUserConnections";
import {
  InvitationsPanel,
  type InvitationDeliveryNotice,
  type PanelInvitation,
} from "@/components/membership/InvitationsPanel";
import type {
  MembershipRole,
  MembershipRoleOption,
} from "@/components/membership/types";

interface InvitationManagerProps {
  organizationId: string;
  organizationName: string;
  userRole: OrgRole;
}

function buildAcceptUrl(token: string): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://www.aimatrx.com";
  // Byte-identical to the link the invitation email sends: the TOKEN and
  // nothing else. The invited address never travels in a URL (DD-091) — the
  // sign-up page resolves it from the token through `inv_peek_invited_email`.
  return `${origin}/invitations/organization/accept/${token}`;
}

export function InvitationManager({
  organizationId,
  organizationName,
  userRole,
}: InvitationManagerProps) {
  const { invitations, loading, error, refresh } =
    useOrganizationInvitations(organizationId);
  const {
    invite,
    cancel,
    resend,
    loading: operationLoading,
  } = useInvitationOperations(organizationId);
  const { connections, isLoading: connectionsLoading } = useUserConnections({
    invitationOrganizationId: organizationId,
  });
  // The honest state when the invitation row exists but its email did not go
  // out (DD-091). A green toast here would be the screen lying.
  const [deliveryNotice, setDeliveryNotice] =
    useState<InvitationDeliveryNotice | null>(null);

  const roleOptions: MembershipRoleOption[] = [
    { value: "member", label: "Member" },
    { value: "admin", label: "Admin" },
    ...(userRole === "owner"
      ? [{ value: "owner" as const, label: "Owner" }]
      : []),
  ];

  const handleInvite = async (email: string, role: MembershipRole) => {
    const result = await invite({ email, role: role as OrgRole });
    if (!result.success) {
      toast.error(result.error || "Failed to send invitation");
      return;
    }
    if ("emailSent" in result && result.emailSent === false) {
      const acceptUrl =
        ("acceptUrl" in result ? result.acceptUrl : undefined) ??
        (result.invitation?.token
          ? buildAcceptUrl(result.invitation.token)
          : undefined);
      if (acceptUrl) {
        setDeliveryNotice({
          email,
          acceptUrl,
          reason: "emailError" in result ? result.emailError : undefined,
        });
      }
      toast.warning(
        `Invitation created for ${email}, but the email could not be sent`,
      );
      refresh();
      return;
    }
    setDeliveryNotice(null);
    toast.success(`Invitation sent to ${email}`);
    refresh();
  };

  const handleCancel = async (invitation: PanelInvitation) => {
    const result = await cancel(invitation.id);
    if (result.success) {
      toast.success(`Cancelled invitation to ${invitation.email}`);
      refresh();
    } else {
      toast.error(result.error || "Failed to cancel invitation");
    }
  };

  const handleResend = async (invitation: PanelInvitation) => {
    const result = await resend(invitation.id, { email: invitation.email });
    if (!result.success) {
      toast.error(result.error || "Failed to resend invitation");
      return;
    }
    if ("emailSent" in result && result.emailSent === false) {
      const acceptUrl = "acceptUrl" in result ? result.acceptUrl : undefined;
      if (acceptUrl) {
        setDeliveryNotice({
          email: invitation.email,
          acceptUrl,
          reason: "emailError" in result ? result.emailError : undefined,
          wasResend: true,
        });
      }
      toast.warning(
        `Invitation refreshed for ${invitation.email}, but the email could not be sent`,
      );
      refresh();
      return;
    }
    setDeliveryNotice(null);
    toast.success(`Resent invitation to ${invitation.email}`);
    refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
      </div>
    );
  }

  return (
    <InvitationsPanel
      invitations={invitations as PanelInvitation[]}
      roleOptions={roleOptions}
      defaultRole="member"
      contacts={connections}
      contactsLoading={connectionsLoading}
      operationLoading={operationLoading}
      inviteAcceptUrl={buildAcceptUrl}
      onInvite={handleInvite}
      onCancel={handleCancel}
      onResend={handleResend}
      onRefresh={refresh}
      refreshing={loading}
      deliveryNotice={deliveryNotice}
      onDismissDeliveryNotice={() => setDeliveryNotice(null)}
      copyContainer={{
        noun: "organization",
        id: organizationId,
        name: organizationName,
      }}
    />
  );
}
