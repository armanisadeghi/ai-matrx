"use client";

// features/sharing/outside/PendingTableInvitation.tsx
//
// A TABLE THAT WAS SHARED WITH HER BUT NOT YET OPENED SAYS SO (MOVE-AND-OUTSIDER,
// VERIFIER-19 finding 3). A table page that is "not given" asks the store once for
// the signed-in person's own pending table invitations
// (`custom.table_share_outside_for_me`). When one is for THIS table, the page says
// who shared it and at what level and offers the one step — opening the
// invitation — instead of "You have not been given this table". Absent otherwise:
// the honest refusal the page already draws stands.

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import { myPendingTableInvitations, type MyPendingTableInvitation } from "./outsideShareService";

export function usePendingTableInvitation(tableId: string, enabled: boolean) {
  const [found, setFound] = useState<MyPendingTableInvitation | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setFound(undefined);
    myPendingTableInvitations()
      .then((rows) => {
        if (alive) setFound(rows.find((row) => row.table_id === tableId) ?? null);
      })
      // Could not ask: the page's own refusal stands, which is still true.
      .catch(() => alive && setFound(null));
    return () => {
      alive = false;
    };
  }, [tableId, enabled]);
  return found;
}

export function PendingTableInvitation({ invitation }: { invitation: MyPendingTableInvitation }) {
  return (
    <div
      className="flex flex-col items-start gap-2 rounded-md border border-dashed p-6"
      data-pending-table-invitation={invitation.invitation_id}
    >
      <p className="text-sm font-medium">
        {invitation.organization ?? "An organization"} shared {invitation.table_name} with you
      </p>
      <p className="max-w-prose text-xs text-muted-foreground">
        {invitation.say} Open the invitation once and the table opens here from then on.
      </p>
      <Button size="sm" asChild>
        <Link href={`/invitations/table/accept/${encodeURIComponent(invitation.token)}`}>
          Open the invitation
        </Link>
      </Button>
    </div>
  );
}
