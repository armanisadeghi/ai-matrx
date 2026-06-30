import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("tutor");

// A single tutor conversation. View-gated (shareable read-only transcript);
// the live tutor itself is the owner's session.
export default function TutorConversationPage() {
  return <EduToolComingSoon slug="tutor" surface={{ label: "Conversation", gate: "view" }} />;
}
