// /education/flashcards/[setId]/learn — Phase 1B "Learn" mode: adaptive
// within-session reshuffle weighted toward weak cards (method='learn').
// Server shell: resolves async params, then renders the client study island.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { LearnSurface } from "@/features/flashcards/components/study/LearnSurface";

export const metadata: Metadata = toolMetadata("flashcards");

interface FlashcardLearnPageProps {
  params: Promise<{ setId: string }>;
}

export default async function FlashcardLearnPage({
  params,
}: FlashcardLearnPageProps) {
  const { setId } = await params;
  return <LearnSurface setId={setId} />;
}
