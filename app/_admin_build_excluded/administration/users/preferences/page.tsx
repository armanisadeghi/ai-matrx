// Users & Access › Preferences — drift dashboard + per-user actual values.
// Thin shell; useSearchParams (?user focus) needs a Suspense boundary.

import { Suspense } from "react";
import { PreferencesTabClient } from "@/features/admin/users/components/PreferencesTabClient";

export default function UsersPreferencesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <div className="h-40 animate-pulse rounded-md bg-muted/50" />
        </div>
      }
    >
      <PreferencesTabClient />
    </Suspense>
  );
}
