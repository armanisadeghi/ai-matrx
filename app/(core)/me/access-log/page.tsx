// app/(core)/me/access-log/page.tsx — THE SUBJECT'S OWN PAGE (DD-137a).
//
// 🚨 THIS PATH IS LOAD-BEARING. `/me/access-log` is the deep link the database
// writes into every emergency-door notification (`iam._notify_door`). Renaming
// the route breaks every notice already sent. If it ever must move, the SQL
// moves in the same migration.
//
// Guests are bounced to login rather than shown an empty page: this surface is
// meaningless without an identity, and "nobody has ever opened your data" would
// be a lie told to a signed-out browser.

import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import MyAccessLog from "@/features/emergency-access/components/MyAccessLog";

export default async function MyAccessLogPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/login?next=/me/access-log");
  }

  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-medium truncate">Who opened my data</span>
        </div>
      </PageHeader>
      <MyAccessLog />
    </>
  );
}
