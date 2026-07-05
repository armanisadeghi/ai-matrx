// /education/flashcards/[setId]/write — Phase 1B "Write" mode: free-typed
// recall graded against the back text (Levenshtein similarity), method='write'.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { WriteSurface } from "@/features/flashcards/components/study/WriteSurface";

export const metadata: Metadata = toolMetadata("flashcards");

interface FlashcardWritePageProps {
  params: Promise<{ setId: string }>;
}

export default async function FlashcardWritePage({
  params,
}: FlashcardWritePageProps) {
  const { setId } = await params;
  return <WriteSurface setId={setId} />;
}
