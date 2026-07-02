// /education/flashcards/review — the adaptive "Review due" session (VISION §2
// Learn / §16 "what to study next"). Studies the FSRS due queue across ALL the
// learner's sets. Server shell → the client study island (Next code-splits it).
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { ReviewDueSurface } from "@/features/flashcards/components/study/ReviewDueSurface";

export const metadata: Metadata = toolMetadata("flashcards");

export default function FlashcardReviewPage() {
  return <ReviewDueSurface />;
}
