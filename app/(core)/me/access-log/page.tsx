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

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import {
  AccessLogFeed,
  AccessLogFeedSkeleton,
} from "@/features/access-log/components/AccessLogFeed";

export default async function MyAccessLogPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    redirect(await currentRequestLoginHref("/me/access-log"));
  }

  return (
    <>
      <RecordPageHeader record={{ name: "Who opened my data" }} />
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 p-4 pt-[var(--shell-header-h)] sm:p-6 sm:pt-[var(--shell-header-h)]">
          <div className="space-y-1">
            <h1
              className="text-lg font-semibold"
              title="Emergency access is read-only, expires, and is logged here, including refusals"
            >
              Every time anyone opened your data
            </h1>
          </div>
          <Suspense fallback={<AccessLogFeedSkeleton />}>
            <AccessLogFeed />
          </Suspense>
        </div>
      </div>
    </>
  );
}
