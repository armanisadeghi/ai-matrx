// /education/tutor/new — a fresh AI Tutor conversation. Server shell: metadata
// + the client conversation island (code-split). EducationTutorClient mounts
// with no conversationId, so the launcher mints a fresh grounded conversation
// and promotes the URL to /education/tutor/[conversationId] after the first
// message.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { EducationTutorClient } from "@/features/education/tutor/components/EducationTutorClient";

export const metadata: Metadata = toolMetadata("tutor");

export default function NewTutorSessionPage() {
  return <EducationTutorClient />;
}
