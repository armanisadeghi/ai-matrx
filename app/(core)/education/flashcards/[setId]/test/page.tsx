// /education/flashcards/[setId]/test — Phase 1B "Test" mode: multiple-choice
// quiz using in-set distractors (AI fallback for small sets), method='test'.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { TestSurface } from "@/features/flashcards/components/study/TestSurface";

export const metadata: Metadata = toolMetadata("flashcards");

interface FlashcardTestPageProps {
  params: Promise<{ setId: string }>;
}

export default async function FlashcardTestPage({
  params,
}: FlashcardTestPageProps) {
  const { setId } = await params;
  return <TestSurface setId={setId} />;
}
