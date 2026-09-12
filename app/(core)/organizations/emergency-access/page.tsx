// app/(core)/organizations/emergency-access/page.tsx — THE APPROVER'S QUEUE (DD-137a).
//
// 🚨 THIS PATH IS LOAD-BEARING. `/organizations/emergency-access` is the deep
// link the database writes into every "an emergency access request needs your
// approval" notice (`iam._notify_door`). Renaming the route breaks every notice
// already sent; if it must move, the SQL moves in the same migration.

import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import EmergencyAccessQueue from "@/features/emergency-access/components/EmergencyAccessQueue";

export default async function EmergencyAccessPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/login?next=/organizations/emergency-access");
  }

  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 min-w-0">
          <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-medium truncate">Emergency access</span>
        </div>
      </PageHeader>
      <EmergencyAccessQueue />
    </>
  );
}
