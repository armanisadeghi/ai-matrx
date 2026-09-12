// app/(core)/organizations/emergency-access/page.tsx — THE APPROVER'S QUEUE (DD-137a).
//
// 🚨 THIS PATH IS LOAD-BEARING. `/organizations/emergency-access` is the deep
// link the database writes into every "an emergency access request needs your
// approval" notice (`iam._notify_door`). Renaming the route breaks every notice
// already sent; if it must move, the SQL moves in the same migration.
//
// The queue is fetched on the server so the page paints complete, and the
// "do you own an organization at all" question is answered here too: an owner
// with nothing waiting and an admin who can never approve anything are two
// different screens, and showing the same empty box for both would be a lie by
// omission.

import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { PendingDoorQueue } from "@/features/emergency-access/components/PendingDoorQueue";
import { listPendingEmergencyDoorRequests } from "@/features/emergency-access/service";

export default async function EmergencyAccessPage() {
  const { isAuthenticated, user } = await getServerAuth();
  if (!isAuthenticated || !user) {
    redirect("/login?next=/organizations/emergency-access");
  }

  const client = await createClient();
  const [pending, ownership] = await Promise.all([
    listPendingEmergencyDoorRequests(client),
    client
      .schema("iam")
      .from("organization_member")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .limit(1),
  ]);

  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 min-w-0">
          <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-medium truncate">Emergency access</span>
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl p-4 sm:p-6 space-y-4">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">
              Emergency access requests
            </h1>
            <p className="text-sm text-muted-foreground">
              Private data does not open on one person&rsquo;s word. An admin
              asks; an owner decides. Whatever you decide, the person whose data
              it is has already been told it was asked for.
            </p>
          </div>
          <PendingDoorQueue
            initialRequests={pending.ok ? pending.data : []}
            ownsAnOrganization={(ownership.data?.length ?? 0) > 0}
          />
        </div>
      </div>
    </>
  );
}
