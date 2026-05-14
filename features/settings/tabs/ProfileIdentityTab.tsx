"use client";

// Settings sub-tab: deep-link into the Identity section of the user
// profile page. Renders the same UserProfilePage as the parent Profile
// tab but scrolls to the Identity section on mount.

import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PROFILE_SECTION_IDS } from "@/features/user-profile/types";

const UserProfilePage = lazy(
  () => import("@/features/user-profile/components/UserProfilePage"),
);

export default function ProfileIdentityTab() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <UserProfilePage embedded defaultSection={PROFILE_SECTION_IDS.identity} />
    </Suspense>
  );
}
