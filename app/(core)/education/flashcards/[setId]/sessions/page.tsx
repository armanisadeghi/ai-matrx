// /education/flashcards/[setId]/sessions — the deck's Progress screen (the deck
// page's "Progress" button): mastery, streak, scores over time, the cards that
// need practice, and every session. Server shell → the client DeckProgressView.
// Session rows open the shared session detail under /education/flashcards/sessions.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { DeckProgressView } from "@/features/flashcards/components/set-detail/DeckProgressView";

export const metadata: Metadata = toolMetadata("flashcards");

interface DeckProgressPageProps {
  params: Promise<{ setId: string }>;
}

export default async function DeckProgressPage({ params }: DeckProgressPageProps) {
  const { setId } = await params;
  return <DeckProgressView setId={setId} />;
}
