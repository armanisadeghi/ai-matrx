// Users & Access › Communications › Meetings — platform usage, meeting history,
// meet.* settings and Meet retention. Thin shell; useSearchParams (?tab, ?org)
// needs a Suspense boundary.

import { Suspense } from "react";
import { MeetingsAdminClient } from "@/features/admin/meetings/components/MeetingsAdminClient";

export default function UsersMeetingsPage() {
  return (
    <Suspense fallback={<div className="p-3"><div className="h-96 animate-pulse rounded-md bg-muted/50" /></div>}>
      <MeetingsAdminClient />
    </Suspense>
  );
}
