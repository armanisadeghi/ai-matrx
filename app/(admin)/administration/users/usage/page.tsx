// Users & Access › Usage & Cost — per user (requests, tokens, stored cost).
// Thin shell; useSearchParams (?user focus) needs a Suspense boundary.

import { Suspense } from "react";
import { UsageTableClient } from "@/features/admin/users/components/UsageTableClient";

export default function UsersUsagePage() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <div className="h-96 animate-pulse rounded-md bg-muted/50" />
        </div>
      }
    >
      <UsageTableClient />
    </Suspense>
  );
}
