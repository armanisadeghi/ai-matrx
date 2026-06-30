// /education/flashcards/[setId] — set detail (header + card grid + Study).
// Server shell: resolves async params, then renders the client detail island.
// SetDetailView is a "use client" leaf — importing it here forms the client
// boundary (Next.js code-splits it); it loads the set via supabase-js / RLS.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { SetDetailView } from "@/features/flashcards/components/set-detail/SetDetailView";

export const metadata: Metadata = toolMetadata("flashcards");

interface FlashcardSetPageProps {
  params: Promise<{ setId: string }>;
}

export default async function FlashcardSetPage({
  params,
}: FlashcardSetPageProps) {
  const { setId } = await params;
  return <SetDetailView setId={setId} />;
}
