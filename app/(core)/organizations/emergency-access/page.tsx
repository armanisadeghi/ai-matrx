// app/(core)/organizations/emergency-access/page.tsx — THE APPROVER'S QUEUE (DD-137a).
//
// 🚨 THIS PATH IS LOAD-BEARING. `/organizations/emergency-access` is the deep
// link the database writes into every "an emergency access request needs your
// approval" notice (`iam._notify_door`). Renaming the route breaks every notice
// already sent; if it must move, the SQL moves in the same migration.
//
// The queue is fetched on the server so the page paints complete, and the "do
// you own an organization at all" question is answered here too: an owner with
// nothing waiting and an admin who can never approve anything are two different
// screens, and showing the same empty box for both would be a lie by omission.
//
// 🚨 A FAILED READ IS NEVER AN EMPTY QUEUE. `iam.emergency_door_pending()`
// answering `[]` means "nothing is waiting"; a transport or permission failure
// means "we do not know", and the two must never paint the same. The failure
// says so, in the door's own words, above the queue.

import { redirect } from "next/navigation";
import { KeyRound, ShieldAlert } from "lucide-react";

import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { PendingDoorQueue } from "@/features/emergency-access/components/PendingDoorQueue";
import { listPendingEmergencyDoorRequests } from "@/features/emergency-access/service";

export default async function EmergencyAccessPage() {
  const { isAuthenticated, user } = await getServerAuth();
  if (!isAuthenticated || !user) {
    redirect(
      await currentRequestLoginHref("/organizations/emergency-access"),
    );
  }

  const client = await createClient();
  const [pending, ownership] = await Promise.all([
    listPendingEmergencyDoorRequests(client),
    // `iam.organization_member` carries no RLS and `authenticated` may read it,
    // so this is the plain direct-lane read it looks like. It answers only
    // "could this account ever approve anything", never who may approve what —
    // the door decides that, every time, on its own.
    client
      .schema("iam")
      .from("organization_member")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .limit(1),
  ]);

  // A failed ownership read must not silently demote an owner to "you do not
  // own an organization". Unknown resolves toward showing the queue, and the
  // door refuses anything this account may not actually do.
  const ownsAnOrganization = ownership.error
    ? true
    : (ownership.data?.length ?? 0) > 0;

  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <KeyRound
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="truncate text-sm font-medium">Emergency access</span>
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 p-4 pt-[var(--shell-header-h)] sm:p-6 sm:pt-[var(--shell-header-h)]">
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

          {pending.ok ? null : (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                The queue could not be loaded
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {pending.message} This is not an empty queue — somebody may be
                waiting on you and this page cannot see it. Reload, and if it
                keeps happening tell us.
              </p>
            </div>
          )}

          {pending.ok ? (
            <PendingDoorQueue
              initialRequests={pending.data}
              ownsAnOrganization={ownsAnOrganization}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
