// /education/flashcards/[setId]/sessions — study sessions for ONE set.
// Server shell → the mode-agnostic SessionsBrowser, scoped to this set's id.
// Rows open the shared session detail under /education/flashcards/sessions.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { SessionsBrowser } from "@/features/education/study/components/SessionsBrowser";

export const metadata: Metadata = toolMetadata("flashcards");

interface SetSessionsPageProps {
  params: Promise<{ setId: string }>;
}

export default async function SetSessionsPage({ params }: SetSessionsPageProps) {
  const { setId } = await params;
  return (
    <SessionsBrowser
      setId={setId}
      title="Sessions for this set"
      backHref={`/education/flashcards/${setId}`}
      detailBasePath="/education/flashcards/sessions"
    />
  );
}
