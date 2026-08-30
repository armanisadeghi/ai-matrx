// /education/flashcards/[setId] — set detail (header + card grid + Study).
// Server shell: resolves async params, then renders the client detail island.
// SetDetailView is a "use client" leaf — importing it here forms the client
// boundary (Next.js code-splits it); it loads the set via supabase-js / RLS.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { toolMetadata } from "@/features/education/route-helpers";
import { SetDetailView } from "@/features/flashcards/components/set-detail/SetDetailView";
import { loginHref } from "@/utils/auth/auth-destination";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export const metadata: Metadata = toolMetadata("flashcards");

interface FlashcardSetPageProps {
  params: Promise<{ setId: string }>;
}

export default async function FlashcardSetPage({
  params,
}: FlashcardSetPageProps) {
  const { setId } = await params;
  const destination = `/education/flashcards/${setId}`;
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect(loginHref(destination));
  return <SetDetailView setId={setId} />;
}
