// /education/flashcards/[setId]/study — focused classic-flip study session.
// Server shell: resolves async params, then renders the client study island.
// StudySurface is a "use client" leaf (flip/grade/keyboard) — importing it here
// forms the client boundary (Next.js code-splits it automatically).
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { StudySurface } from "@/features/flashcards/components/study/StudySurface";

export const metadata: Metadata = toolMetadata("flashcards");

interface FlashcardStudyPageProps {
  params: Promise<{ setId: string }>;
}

export default async function FlashcardStudyPage({
  params,
}: FlashcardStudyPageProps) {
  const { setId } = await params;
  return <StudySurface setId={setId} />;
}
