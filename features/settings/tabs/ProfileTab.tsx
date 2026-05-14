"use client";

import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Lazy-load the actual form so the rest of the settings shell isn't
// blocked by the avatar uploader's heavy dependency graph.
const UserProfilePage = lazy(
  () => import("@/features/user-profile/components/UserProfilePage"),
);

export default function ProfileTab() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <UserProfilePage embedded />
    </Suspense>
  );
}
