// /education/flashcards/progress — redirects to the unified cross-mode progress
// dashboard (P5). Progress was promoted out of flashcards to /education/progress
// (mastery/accuracy/weak-areas/trends now span every study mode, not just cards);
// this keeps the old flashcards entry point alive as a redirect.
import { redirect } from "next/navigation";

export default function FlashcardProgressPage() {
  redirect("/education/progress");
}
