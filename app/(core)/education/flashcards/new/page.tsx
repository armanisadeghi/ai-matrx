// /education/flashcards/new — THE one way to make a flashcard deck:
// Sources → Style and details → Make the deck (or Import a deck file).
// Server shell: metadata + the client page. CreateDeckPage reads the query
// (a Source handed over in the link), so it sits inside a Suspense boundary.
import { Suspense } from "react";
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { CreateDeckPage } from "@/features/flashcards/components/create/CreateDeckPage";

export const metadata: Metadata = toolMetadata("flashcards");

export default function NewFlashcardDeckPage() {
  return (
    <Suspense>
      <CreateDeckPage />
    </Suspense>
  );
}
