// Community Library (P6 Phase C) — public browse over community decks.
// Signed-out friendly (view + duplicate-to-edit route through P7); super-admins
// get inline certify controls.

import type { Metadata } from "next";
import { createRouteMetadata } from "@/utils/route-metadata";
import { getCurrentUserAdminStatus } from "@/utils/auth/adminUtils";
import { fetchInitialPublicDecks } from "@/features/education/library/queries";
import { LibraryBrowser } from "@/features/education/library/components/LibraryBrowser";

export const metadata: Metadata = createRouteMetadata("/education", {
  titlePrefix: "Community Library",
  title: "Education",
  description:
    "Free, public study decks from the AI Matrx community — study a copy, suggest an improvement, and look for editorially Certified decks.",
  letter: "Lb",
  canonicalPath: "/education/library",
});

export default async function CommunityLibraryPage() {
  const [status, initialDecks] = await Promise.all([
    getCurrentUserAdminStatus(),
    fetchInitialPublicDecks(),
  ]);
  return (
    <LibraryBrowser
      initialDecks={initialDecks}
      isSuperAdmin={status?.level === "super_admin"}
      isSignedIn={!!status}
    />
  );
}
