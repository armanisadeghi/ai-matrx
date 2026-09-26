// /education/flashcards-2 — an isolated action-bar concept for comparison.
// The original /education/flashcards route keeps its header-based actions.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { FlashcardsHome } from "@/features/flashcards/components/home/FlashcardsHome";

export const metadata: Metadata = toolMetadata("flashcards");

export default function FlashcardsConceptPage() {
  return <FlashcardsHome actionLayout="page" />;
}
