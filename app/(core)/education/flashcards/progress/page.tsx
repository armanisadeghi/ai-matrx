// /education/flashcards/progress — the learner's study progress overview
// (VISION §16: mastery distribution, accuracy, what's due, activity). Server shell
// → the mode-agnostic StudyProgress client island over the shared study spine.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { StudyProgress } from "@/features/education/study/components/StudyProgress";

export const metadata: Metadata = toolMetadata("flashcards");

export default function FlashcardProgressPage() {
  return (
    <StudyProgress
      itemType="fc_card"
      title="Your flashcard progress"
      backHref="/education/flashcards"
      reviewHref="/education/flashcards/review"
    />
  );
}
