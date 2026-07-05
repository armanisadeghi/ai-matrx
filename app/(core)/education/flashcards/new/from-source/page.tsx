// /education/flashcards/new/from-source — create a flashcard set from a
// curated selection of RAG-indexed document chunks. Server component shell
// (no "use client"): metadata for SEO + the client create island.
// CreateFromSource is a "use client" leaf, so importing it here forms the
// client boundary and Next.js code-splits it automatically.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { CreateFromSource } from "@/features/flashcards/components/create/CreateFromSource";

export const metadata: Metadata = toolMetadata("flashcards");

export default function NewFlashcardSetFromSourcePage() {
  return <CreateFromSource />;
}
