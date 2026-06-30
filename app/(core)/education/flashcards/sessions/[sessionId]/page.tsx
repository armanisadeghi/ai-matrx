// /education/flashcards/sessions/[sessionId] — one study session's detail:
// header + aggregate, full-session recording, holistic review, and the per-attempt
// ledger (result, score, transcribed answer, response audio). Server shell →
// the flashcards adapter, which labels each attempt with its card front.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { FlashcardSessionDetail } from "@/features/flashcards/components/sessions/FlashcardSessionDetail";

export const metadata: Metadata = toolMetadata("flashcards");

interface SessionDetailPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function FlashcardSessionDetailPage({
  params,
}: SessionDetailPageProps) {
  const { sessionId } = await params;
  return <FlashcardSessionDetail sessionId={sessionId} />;
}
