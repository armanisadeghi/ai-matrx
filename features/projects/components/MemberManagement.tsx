"use client";

/**
 * MemberManagement — project wrapper around the shared <MembersPanel />.
 *
 * Identical UI to the organization members surface; only the data wiring and the
 * project-specific role rules differ (no "owner" grant in the project role menu;
 * only owners change roles, admins may remove members). See
 * components/membership/MembersPanel.tsx.
 */

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useProjectMembers, useProjectMemberOperations } from "../hooks";
import type { ProjectRole } from "../types";
import {
  MembersPanel,
  type PanelMember,
} from "@/components/membership/MembersPanel";
import type {
  MembershipRole,
  MembershipRoleOption,
} from "@/components/membership/types";

interface MemberManagementProps {
  projectId: string;
  userRole: ProjectRole;
  isOwner: boolean;
}

const ROLE_OPTIONS: MembershipRoleOption[] = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];

export function MemberManagement({
  projectId,
  userRole,
  isOwner,
}: MemberManagementProps) {
  const { members, loading, error, refresh } = useProjectMembers(projectId);
  const {
    updateRole,
    remove,
    loading: operationLoading,
  } = useProjectMemberOperations(projectId);

  const ownerCount = members.filter((m) => m.role === "owner").length;

  const handleChangeRole = async (member: PanelMember, role: MembershipRole) => {
    const result = await updateRole(member.userId, role as ProjectRole);
    if (result.success) {
      toast.success("Member role updated");
      refresh();
    } else {
      toast.error(result.error ?? "Failed to update role");
    }
  };

  const handleRemove = async (member: PanelMember) => {
    const result = await remove(member.userId);
    if (result.success) {
      toast.success(
        member.user?.email
          ? `Removed ${member.user.email} from project`
          : "Member removed",
      );
      refresh();
    } else {
      toast.error(result.error ?? "Failed to remove member");
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
      containerNoun="project"
      canManageMember={(member) =>
        isOwner || (userRole === "admin" && member.role === "member")
      }
      // Only owners can change roles in projects; admins may remove members only.
      canAssignRole={() => isOwner}
      isLastOwner={(member) => member.role === "owner" && ownerCount === 1}
      onChangeRole={handleChangeRole}
      onRemove={handleRemove}
    />
  );
}
