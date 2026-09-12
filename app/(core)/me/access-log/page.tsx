// app/(core)/me/access-log/page.tsx — THE SUBJECT'S OWN PAGE (DD-137a).
//
// 🚨 THIS PATH IS LOAD-BEARING. `/me/access-log` is the deep link the database
// writes into every emergency-door notice (`iam._notify_door`). Renaming the
// route breaks every notification already sent; if it ever must move, the SQL
// moves in the same migration.
//
// Guests are bounced to login rather than shown an empty page: "nobody has ever
// opened your data" is a sentence that must never be said to a browser with no
// identity behind it. The bounce carries the destination through the canonical
// primitive, so a person who follows the notification link, signs in, and comes
// back lands HERE and not on a dashboard.
//
// The list itself is a Server Component behind one Suspense boundary with a
// dimension-matched skeleton: the page chrome paints instantly and the rows
// stream into a hole of the same size, so nothing shifts.

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import PageHeader from "@/features/shell/components/header/PageHeader";
import {
  AccessLogFeed,
  AccessLogFeedSkeleton,
} from "@/features/emergency-access/components/AccessLogFeed";

export default async function MyAccessLogPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect(await currentRequestLoginHref("/me/access-log"));
  }

  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="truncate text-sm font-medium">
            Who opened my data
          </span>
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 p-4 pt-[var(--shell-header-h)] sm:p-6 sm:pt-[var(--shell-header-h)]">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">
              Every time anyone opened your data
            </h1>
            <p className="text-sm text-muted-foreground">
              Your private data cannot be read by an admin browsing around. The
              only way in is an emergency door that is read-only, expires by
              itself, and lands here — including the times someone asked and was
              turned away.
            </p>
          </div>
          <Suspense fallback={<AccessLogFeedSkeleton />}>
            <AccessLogFeed />
          </Suspense>
        </div>
      </div>
    </>
  );
}
