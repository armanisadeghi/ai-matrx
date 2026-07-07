// /education/tutor/[conversationId] — a single AI Tutor conversation. Server
// shell: resolves async params, then renders the client conversation island
// (code-split) which loads the existing transcript. View-gated (the shareable
// read-only transcript); the live tutor itself is the owner's session.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { EducationTutorClient } from "@/features/education/tutor/components/EducationTutorClient";

export const metadata: Metadata = toolMetadata("tutor");

interface TutorConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function TutorConversationPage({
  params,
}: TutorConversationPageProps) {
  const { conversationId } = await params;
  return <EducationTutorClient conversationId={conversationId} />;
}
