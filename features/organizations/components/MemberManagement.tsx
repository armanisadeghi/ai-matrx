"use client";

/**
 * MemberManagement — organization wrapper around the shared <MembersPanel />.
 *
 * Thin by design: it fetches org members with the org hooks and supplies the
 * org-specific role rules (only owners can grant owner; admins manage members
 * only; personal orgs are read-only). The list UI, quick actions, and dialogs
 * live in the shared panel so the org and project members surfaces stay in
 * lock-step. See components/membership/MembersPanel.tsx.
 */

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useOrganizationMembers, useMemberOperations } from "../hooks";
import type { OrgRole } from "../types";
import {
  MembersPanel,
  type PanelMember,
} from "@/components/membership/MembersPanel";
import type {
  MembershipRole,
  MembershipRoleOption,
} from "@/components/membership/types";

interface MemberManagementProps {
  organizationId: string;
  userRole: OrgRole;
  isOwner: boolean;
  isPersonal: boolean;
}

const ROLE_OPTIONS: MembershipRoleOption[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];

export function MemberManagement({
  organizationId,
  userRole,
  isOwner,
  isPersonal,
}: MemberManagementProps) {
  const { members, loading, error, refresh } =
    useOrganizationMembers(organizationId);
  const {
    updateRole,
    remove,
    loading: operationLoading,
  } = useMemberOperations(organizationId);

  const ownerCount = members.filter((m) => m.role === "owner").length;

  const handleChangeRole = async (member: PanelMember, role: MembershipRole) => {
    const result = await updateRole(member.userId, role as OrgRole);
    if (result.success) {
      toast.success(`Updated ${member.user?.email}'s role to ${role}`);
      refresh();
    } else {
      toast.error(result.error || "Failed to update role");
    }
  };

  const handleRemove = async (member: PanelMember) => {
    const result = await remove(member.userId);
    if (result.success) {
      toast.success(`Removed ${member.user?.email} from organization`);
      refresh();
    } else {
      toast.error(result.error || "Failed to remove member");
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
        <Button onClick={refresh} variant="outline" size="sm" className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <MembersPanel
      members={members as PanelMember[]}
      roleOptions={ROLE_OPTIONS}
      operationLoading={operationLoading}
      containerNoun="organization"
      canManageMember={(member) =>
        !isPersonal &&
        (isOwner || (userRole === "admin" && member.role === "member"))
      }
      canAssignRole={(_member, role) => (role === "owner" ? isOwner : true)}
      isLastOwner={(member) => member.role === "owner" && ownerCount === 1}
      onChangeRole={handleChangeRole}
      onRemove={handleRemove}
      footerNotice={
        isPersonal ? (
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
            <p className="text-sm text-purple-800 dark:text-purple-200">
              <strong>Personal Organization:</strong> This is your personal
              space. You cannot add or remove members.
            </p>
          </div>
        ) : undefined
      }
    />
  );
}
