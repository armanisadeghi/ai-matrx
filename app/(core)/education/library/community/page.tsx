import type { Metadata } from "next";
import { requestInAdminLane } from "@/utils/auth/adminLaneServer";
import { createRouteMetadata } from "@/utils/route-metadata";
import { getCurrentUserAdminStatus } from "@/utils/auth/adminUtils";
import {
  fetchInitialPublicDecks,
  fetchOwnerOpenSuggestionCount,
} from "@/features/education/library/queries";
import { LibraryBrowser } from "@/features/education/library/components/LibraryBrowser";

export const metadata: Metadata = createRouteMetadata("/education", {
  titlePrefix: "Community Library",
  title: "Education",
  description:
    "Free, public study decks from the AI Matrx community — study a copy, suggest an improvement, and look for editorially Certified decks.",
  letter: "Lc",
  canonicalPath: "/education/library/community",
});

export default async function CommunityLibraryPage() {
  const [status, laneOpen, initialDecks, openSuggestions] = await Promise.all([
    getCurrentUserAdminStatus(),
    // ADMIN POWER, not identity: the curator controls exist only in the admin
    // section (utils/auth/adminLaneServer.ts) — here an admin is a reader.
    requestInAdminLane(),
    fetchInitialPublicDecks(),
    fetchOwnerOpenSuggestionCount(),
  ]);
  return (
    <LibraryBrowser
      initialDecks={initialDecks}
      isSuperAdmin={laneOpen && status?.level === "super_admin"}
      isSignedIn={!!status}
      openSuggestionCount={openSuggestions}
    />
  );
}
