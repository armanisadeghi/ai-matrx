"use client";

/**
 * MemberManagement — organization wrapper around the shared <MembersPanel />.
 *
 * Thin by design: it fetches org members with the org hooks and supplies the
 * org-specific role rules — one owner per organization (ownership moves only
 * through Transfer ownership), admins manage admins and members but never the
 * owner. The list UI, quick actions, and dialogs
 * live in the shared panel so the org and project members surfaces stay in
 * lock-step. See components/membership/MembersPanel.tsx.
 */

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useOrganizationMembers, useMemberOperations } from "../hooks";
import { transferOwnership } from "../service";
import type { OrgRole } from "../types";
import {
  MembersPanel,
  type PanelMember,
} from "@/components/membership/MembersPanel";
import type {
  MembershipRole,
  MembershipRoleOption,
} from "@/components/membership/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { MemberPersonalTablesAction } from "@/features/sharing/components/MemberPersonalTablesAction";
import {
  MemberVaultAccessControl,
  useOrganizationVaultMemberAccess,
} from "@/features/secrets/components/MemberVaultAccessControl";
import {
  HrMemberEmployeeSeamProvider,
  MemberEmployeeSeam,
  useMemberEmployeeCopyDetails,
} from "@/features/hr/entry-points/MemberEmployeeSeam";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface MemberManagementProps {
  organizationId: string;
  /** Names the org in copy / export payloads. */
  organizationName?: string;
  userRole: OrgRole;
  isOwner: boolean;
  /** Slug (or id) used to carry the employer context into every HR door. */
  orgSlugOrId?: string;
}

const ROLE_OPTIONS: MembershipRoleOption[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];

export function MemberManagement({
  organizationId,
  organizationName,
  userRole,
  isOwner,
  orgSlugOrId,
}: MemberManagementProps) {
  const { members, loading, error, refresh } =
    useOrganizationMembers(organizationId);
  const {
    updateRole,
    remove,
    loading: operationLoading,
  } = useMemberOperations(organizationId);

  const ownerCount = members.filter((m) => m.role === "owner").length;

  const handleChangeRole = async (
    member: PanelMember,
    role: MembershipRole,
  ) => {
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

  const handleTransferOwnership = async (member: PanelMember) => {
    const result = await transferOwnership(organizationId, member.userId);
    if (result.success) {
      toast.success(
        `${member.user?.email ?? "That member"} now owns this organization. You are an admin here.`,
      );
      refresh();
    } else {
      toast.error(result.error || "Failed to transfer ownership");
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
        <ErrorAlchemyMenu error={error} />
      </div>
    );
  }

  return (
    // SPEC-UI-IA §6 — the member ⇄ employee seam. ONE batched resolution for
    // the whole list, and it renders NOTHING when HR is off here or this viewer
    // has no HR standing: absent, not disabled.
    <HrMemberEmployeeSeamProvider
      organizationId={organizationId}
      orgSlugOrId={orgSlugOrId ?? organizationId}
      userIds={(members as PanelMember[]).map((m) => m.userId)}
    >
      <OrganizationMembersPanel
        members={members as PanelMember[]}
        organizationId={organizationId}
        organizationName={organizationName}
        userRole={userRole}
        isOwner={isOwner}
        operationLoading={operationLoading}
        ownerCount={ownerCount}
        onChangeRole={handleChangeRole}
        onRemove={handleRemove}
        onTransferOwnership={handleTransferOwnership}
      />
    </HrMemberEmployeeSeamProvider>
  );
}

function OrganizationMembersPanel({
  members,
  organizationId,
  organizationName,
  userRole,
  isOwner,
  operationLoading,
  ownerCount,
  onChangeRole,
  onRemove,
  onTransferOwnership,
}: {
  members: PanelMember[];
  organizationId: string;
  organizationName?: string;
  userRole: OrgRole;
  isOwner: boolean;
  operationLoading: boolean;
  ownerCount: number;
  onChangeRole: (member: PanelMember, role: MembershipRole) => Promise<void>;
  onRemove: (member: PanelMember) => Promise<void>;
  onTransferOwnership: (member: PanelMember) => Promise<void>;
}) {
  const memberEmployeeCopyDetails = useMemberEmployeeCopyDetails();
  const viewerId = useAppSelector(selectUserId);
  // SHARE-LANE-2: an owner or admin governs a member's personal Tables by transferring them.
  const viewerGoverns = isOwner || userRole === "admin";
  // Access ladder decision 14: owners/admins set each member's access to the
  // organization vault on the member's own row.
  const vaultAccess = useOrganizationVaultMemberAccess(
    organizationId,
    viewerGoverns,
  );
  const people = members.map((m) => ({
    id: m.userId,
    name: m.user?.displayName ?? m.user?.email ?? "A member",
  }));
  const enrichedMembers = members.map((member) => ({
    ...member,
    copyDetails: memberEmployeeCopyDetails(
      member.userId,
      member.user?.displayName ?? member.user?.email ?? null,
    ),
  }));

  return (
    <MembersPanel
      members={enrichedMembers}
      renderMemberExtra={(member) => (
        <>
          <MemberEmployeeSeam
            userId={member.userId}
            displayName={member.user?.displayName ?? member.user?.email ?? null}
          />
          {viewerGoverns && (
            <MemberVaultAccessControl
              organizationId={organizationId}
              memberUserId={member.userId}
              memberName={
                member.user?.displayName ?? member.user?.email ?? "This member"
              }
              access={vaultAccess.data}
              onChanged={vaultAccess.reload}
            />
          )}
          <MemberPersonalTablesAction
            organizationId={organizationId}
            organizationName={organizationName ?? "this organization"}
            member={{
              id: member.userId,
              name: member.user?.displayName ?? member.user?.email ?? "This member",
            }}
            people={people}
            viewerId={viewerId}
            viewerGoverns={viewerGoverns}
          />
        </>
      )}
      roleOptions={ROLE_OPTIONS}
      operationLoading={operationLoading}
      containerNoun="organization"
      // R21 (Arman, 2026-09-10): "Admins add and remove admins and members."
      // Only the OWNER is untouchable by an admin. The database enforces exactly
      // this in mbr_remove / mbr_update_role — these predicates mirror it, they
      // do not invent a second rule.
      canManageMember={(member) =>
        isOwner || (userRole === "admin" && member.role !== "owner")
      }
      // R21: one owner per organization. "Make Owner" does not exist as a role
      // change — the database refuses it and names Transfer ownership, so the
      // menu item is ABSENT rather than present-and-failing.
      canAssignRole={(_member, role) => role !== "owner"}
      canTransferOwnership={(member) =>
        isOwner && member.role !== "owner"
      }
      onTransferOwnership={onTransferOwnership}
      isLastOwner={(member) => member.role === "owner" && ownerCount === 1}
      onChangeRole={onChangeRole}
      onRemove={onRemove}
      copyContainer={{
        noun: "organization",
        id: organizationId,
        name: organizationName,
      }}
    />
  );
}
