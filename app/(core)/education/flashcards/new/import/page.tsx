// /education/flashcards/new/import — CSV/Quizlet-paste import (Phase 1A).
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { ImportSetView } from "@/features/flashcards/components/import/ImportSetView";

export const metadata: Metadata = toolMetadata("flashcards");

export default function ImportFlashcardSetPage() {
  return <ImportSetView />;
}
