"use client";

/**
 * features/sharing/components/MemberPersonalTablesAction.tsx — lane SHARE-LANE-2.
 *
 * Under a member's row in organization settings, for the organization's owners and admins:
 * "Transfer their personal tables…". It opens TransferTableOwnership, which asks the store which
 * personal Tables the member keeps (ids and a count, never names) and moves them with a reason.
 * Absent for anybody who is not an owner or admin, and on the viewer's own row.
 */

import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransferTableOwnership, type TransferPerson } from "./TransferTableOwnership";

export interface MemberPersonalTablesActionProps {
  organizationId: string;
  organizationName: string;
  member: TransferPerson;
  people: TransferPerson[];
  viewerId: string | null;
  viewerGoverns: boolean;
}

export function MemberPersonalTablesAction({
  organizationId,
  organizationName,
  member,
  people,
  viewerId,
  viewerGoverns,
}: MemberPersonalTablesActionProps) {
  const [open, setOpen] = useState(false);
  if (!viewerGoverns || !viewerId || viewerId === member.id) return null;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={() => setOpen(true)}
        data-member-transfer-tables={member.id}
      >
        <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
        Transfer their personal tables…
      </Button>
      {open && (
        <TransferTableOwnership
          open={open}
          onOpenChange={setOpen}
          organizationId={organizationId}
          organizationName={organizationName}
          from={member}
          people={people}
          viewerId={viewerId}
        />
      )}
    </>
  );
}
