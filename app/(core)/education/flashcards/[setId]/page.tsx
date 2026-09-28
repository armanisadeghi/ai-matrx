// /education/flashcards/[setId] — set detail (header + card grid + Study).
// Server shell: resolves async params, then renders the client detail island.
// SetDetailView is a "use client" leaf — importing it here forms the client
// boundary (Next.js code-splits it); it loads the set via supabase-js / RLS.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { toolMetadata } from "@/features/education/route-helpers";
import { SetDetailView } from "@/features/flashcards/components/set-detail/SetDetailView";
import { loginHref } from "@/utils/auth/auth-destination";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { createClient } from "@/utils/supabase/server";
import { displayTitle } from "@/components/markdown-core/plain-title";

/** A server read never waits without a limit: past this the header shows a
 *  placeholder and the client fills the name in. */
const DECK_NAME_READ_MS = 1500;

/** The deck's name for the header's first paint (page-pass 2026-09-27: the
 *  header said "Flashcard set" for seconds while the client loaded). */
async function readDeckName(setId: string): Promise<string | null> {
  const read = (async () => {
    const supabase = await createClient();
    const { data } = await supabase
      .schema("education")
      .from("fc_set")
      .select("name")
      .eq("id", setId)
      .maybeSingle();
    return data?.name ? displayTitle(data.name) : null;
  })().catch(() => null);
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), DECK_NAME_READ_MS),
  );
  return Promise.race([read, timeout]);
}

export const metadata: Metadata = toolMetadata("flashcards");

interface FlashcardSetPageProps {
  params: Promise<{ setId: string }>;
}

export default async function FlashcardSetPage({
  params,
}: FlashcardSetPageProps) {
  const { setId } = await params;
  const destination = `/education/flashcards/${setId}`;
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref(destination));
  const initialName = await readDeckName(setId);
  return <SetDetailView setId={setId} initialName={initialName} />;
}
