// /education/flashcards/new — create a flashcard set from a topic with AI.
// Server component shell (no "use client"): metadata for SEO + the client
// create island. CreateFromTopic is a "use client" leaf, so importing it here
// forms the client boundary and Next.js code-splits it automatically — no
// `dynamic` needed (and `dynamic({ ssr:false })` is illegal in a Server
// Component).
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { CreateFromTopic } from "@/features/flashcards/components/create/CreateFromTopic";

export const metadata: Metadata = toolMetadata("flashcards");

export default function NewFlashcardSetPage() {
  return <CreateFromTopic />;
}
