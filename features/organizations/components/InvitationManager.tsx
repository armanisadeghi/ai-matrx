"use client";

/**
 * InvitationManager — organization wrapper around the shared <InvitationsPanel />.
 *
 * Fetches org invitations + the user's contacts (for quick-select) with the org
 * hooks and supplies the org accept-URL builder. All UI lives in the shared
 * panel. See components/membership/InvitationsPanel.tsx.
 */

import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useOrganizationInvitations, useInvitationOperations } from "../hooks";
import type { OrgRole } from "../types";
import { useUserConnections } from "@/features/messaging/hooks/useUserConnections";
import {
  InvitationsPanel,
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
  return `${origin}/invitations/organization/accept/${token}`;
}

export function InvitationManager({
  organizationId,
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
  const { connections, isLoading: connectionsLoading } = useUserConnections();

  const roleOptions: MembershipRoleOption[] = [
    { value: "member", label: "Member" },
    { value: "admin", label: "Admin" },
    ...(userRole === "owner"
      ? [{ value: "owner" as const, label: "Owner" }]
      : []),
  ];

  const handleInvite = async (email: string, role: MembershipRole) => {
    const result = await invite({ email, role: role as OrgRole });
    if (result.success) {
      toast.success(`Invitation sent to ${email}`);
      refresh();
    } else {
      toast.error(result.error || "Failed to send invitation");
    }
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
    const result = await resend(invitation.id);
    if (result.success) {
      toast.success(`Resent invitation to ${invitation.email}`);
      refresh();
    } else {
      toast.error(result.error || "Failed to resend invitation");
    }
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
    />
  );
}
