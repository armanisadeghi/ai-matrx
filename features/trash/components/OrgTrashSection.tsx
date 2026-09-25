"use client";

/**
 * Organization settings → Trash (lane TRASH-2). Owners and admins restore what members archived
 * in THIS organization — the same <TrashList> the personal /trash page renders, in organization
 * mode. The host (OrgManage) renders it only for owners and admins: for everyone else the section
 * and its nav chip are absent, never disabled. The server refuses non-admins regardless.
 */

import { TrashList, type TrashMemberOption } from "@/features/trash/components/TrashList";
import { useOrganizationMembers } from "@/features/organizations/hooks";

export function OrgTrashSection({ organizationId }: { organizationId: string }) {
  const { members } = useOrganizationMembers(organizationId);
  const options: TrashMemberOption[] = members
    .map((m) => ({
      userId: m.userId,
      label: m.user?.displayName?.trim() || m.user?.email || "Member",
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        What members archived in this organization. Restoring puts it back where it was, records
        it in the organization&apos;s audit log, and tells the person who owns it. Nothing here is
        deleted for good.
      </p>
      <TrashList scope={{ mode: "organization", organizationId, members: options }} />
    </div>
  );
}
