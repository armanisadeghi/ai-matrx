"use client";

/**
 * features/sharing/components/TableTransferOffer.tsx — lane SHARE-LANE-2.
 *
 * On a Table's no-access page, for an owner or admin of the organization the Table lives in:
 * "You are not named on this table." — and the one thing that role does allow, Transfer
 * ownership…, which opens TransferTableOwnership on this one Table. The organization and the
 * current owner come from `access_denied_context` (the record's own organization, never the
 * active-org context); the viewer's role in it from `useUserRole`. Absent for everybody else.
 */

import { useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { fetchAccessDeniedContext } from "@/features/access-gate/service/accessDeniedContext";
import type { AccessDeniedContext } from "@/features/access-gate/types";
import { useOrganizationMembers, useUserRole } from "@/features/organizations/hooks";
import { TransferTableOwnership } from "./TransferTableOwnership";

export function TableTransferOffer({
  tableId,
  onTransferred,
}: {
  tableId: string;
  onTransferred?: () => void;
}) {
  const viewerId = useAppSelector(selectUserId);
  const [ctx, setCtx] = useState<AccessDeniedContext | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchAccessDeniedContext("record", tableId).then((c) => {
      if (live) setCtx(c);
    });
    return () => {
      live = false;
    };
  }, [tableId]);

  const orgId = ctx?.status === "denied" ? (ctx.organization?.id ?? undefined) : undefined;
  const { isAdmin, loading } = useUserRole(orgId);
  const { members } = useOrganizationMembers(isAdmin ? orgId : undefined);

  if (!ctx || !orgId || loading || !isAdmin || !viewerId || !ctx.owner) return null;
  if (ctx.owner.userId === viewerId) return null;

  const orgName = ctx.organization?.name ?? "this organization";
  const ownerName = ctx.owner.displayName ?? "its owner";
  const people = members.map((m) => ({
    id: m.userId,
    name: m.user?.displayName ?? m.user?.email ?? "A member",
  }));

  return (
    <div
      className="mt-4 flex max-w-prose flex-col items-start gap-2 rounded-md border p-4"
      data-table-transfer-offer
    >
      <p className="text-sm font-medium">You are not named on this table.</p>
      <p className="text-xs text-muted-foreground">
        {ownerName} keeps it to the people named on it, so it does not open for the owners and
        admins of {orgName} either. As one of them you can transfer its ownership instead: you
        say why, {ownerName} is told and stays on as an editor, and the transfer is kept in the
        organization&apos;s audit log.
      </p>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-table-transfer-open>
        <ArrowRightLeft className="mr-1.5 h-4 w-4" />
        Transfer ownership…
      </Button>
      {open && (
        <TransferTableOwnership
          open={open}
          onOpenChange={setOpen}
          organizationId={orgId}
          organizationName={orgName}
          from={{ id: ctx.owner.userId, name: ownerName }}
          tableIds={[tableId]}
          people={people}
          viewerId={viewerId}
          onDone={onTransferred}
        />
      )}
    </div>
  );
}
