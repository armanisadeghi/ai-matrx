"use client";

// Standalone /settings/profile route AND the body of the "Profile" tab in
// the settings drawer. All real markup lives in
// `features/user-profile/components/UserProfilePage` so the page itself
// stays a thin wrapper — easier to lazy-load from the settings registry
// and from the ProfileTab settings tab without duplicating layout.

import UserProfilePage from "@/features/user-profile/components/UserProfilePage";

export default function ProfileRoutePage() {
  return <UserProfilePage />;
}
