"use client";

/**
 * InvitationManager — project wrapper around the shared <InvitationsPanel />.
 *
 * Same UI as the organization invitations surface; only the data wiring, the
 * project accept-URL, and the role options differ (no "owner" invite for
 * projects). Projects have no contact source today, so the quick-select picker
 * is simply omitted and the plain email form shows. See
 * components/membership/InvitationsPanel.tsx.
 */

import { useProjectInvitations, useProjectInvitationOperations } from "../hooks";
import type { ProjectRole } from "../types";
import { toast } from "sonner";
import {
  InvitationsPanel,
  type PanelInvitation,
} from "@/components/membership/InvitationsPanel";
import type {
  MembershipRole,
  MembershipRoleOption,
} from "@/components/membership/types";

interface InvitationManagerProps {
  projectId: string;
  projectName: string;
  userRole: ProjectRole;
}

const ROLE_OPTIONS: MembershipRoleOption[] = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

function buildAcceptUrl(token: string): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://www.aimatrx.com";
  return `${origin}/invitations/project/accept/${token}`;
}

export function InvitationManager({
  projectId,
  projectName,
  userRole,
}: InvitationManagerProps) {
  const { invitations, loading, error, refresh } =
    useProjectInvitations(projectId);
  const {
    invite,
    cancel,
    resend,
    loading: operationLoading,
  } = useProjectInvitationOperations(projectId);

  const canManage = userRole === "owner" || userRole === "admin";

  const handleInvite = async (email: string, role: MembershipRole) => {
    const result = await invite({ email, role: role as ProjectRole });
    if (result.success) {
      toast.success(`Invitation sent to ${email}`);
      refresh();
    } else {
      toast.error(result.error ?? "Failed to send invitation");
    }
  };

  const handleCancel = async (invitation: PanelInvitation) => {
    const result = await cancel(invitation.id);
    if (result.success) {
      toast.success(`Cancelled invitation to ${invitation.email}`);
      refresh();
    } else {
      toast.error(result.error ?? "Failed to cancel invitation");
    }
  };

  const handleResend = async (invitation: PanelInvitation) => {
    const result = await resend(invitation.id);
    if (result.success) {
      toast.success(`Invitation resent to ${invitation.email}`);
      refresh();
    } else {
      toast.error(result.error ?? "Failed to resend invitation");
    }
  };

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
      roleOptions={ROLE_OPTIONS}
      defaultRole="member"
      operationLoading={operationLoading}
      inviteAcceptUrl={buildAcceptUrl}
      onInvite={handleInvite}
      onCancel={handleCancel}
      onResend={handleResend}
      onRefresh={refresh}
      refreshing={loading}
      canManage={canManage}
      inviteLabel={`Invite to ${projectName}`}
    />
  );
}
