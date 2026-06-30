// /education/flashcards/sessions — the learner's study-session history (all sets).
// Server shell → the mode-agnostic SessionsBrowser client island. The study spine
// is shared, so this same browser will serve every study mode's history.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { SessionsBrowser } from "@/features/education/study/components/SessionsBrowser";

export const metadata: Metadata = toolMetadata("flashcards");

export default function FlashcardSessionsPage() {
  return (
    <SessionsBrowser
      title="Your study sessions"
      backHref="/education/flashcards"
      detailBasePath="/education/flashcards/sessions"
    />
  );
}
