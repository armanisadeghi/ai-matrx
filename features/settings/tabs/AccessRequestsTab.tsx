"use client";

// General › Access requests — the durable inbox of `iam.access_requests`
// (asks to open something you own, and the asks you sent). Not a setting: the
// settings core renders the canonical surface so it is reachable from the
// route, the Preferences window and the phone drawer alike. Its data never
// moved; the old `/settings/access-requests` URL redirects here.

import { Suspense } from "react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { AccessRequestsSurface } from "@/features/access-gate/components/AccessRequestsSurface";

export default function AccessRequestsTab() {
  return (
    <Suspense fallback={<SuspenseLoader size="sm" message="Reading access requests…" />}>
      <AccessRequestsSurface />
    </Suspense>
  );
}
