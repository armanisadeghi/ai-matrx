// /education/flashcards/[setId]/match — Phase 1B "Match" mode: timed
// click-to-pair matching game, method='match'.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { MatchSurface } from "@/features/flashcards/components/study/MatchSurface";

export const metadata: Metadata = toolMetadata("flashcards");

interface FlashcardMatchPageProps {
  params: Promise<{ setId: string }>;
}

export default async function FlashcardMatchPage({
  params,
}: FlashcardMatchPageProps) {
  const { setId } = await params;
  return <MatchSurface setId={setId} />;
}
