// /education/flashcards/weak-areas — the weak-area drill session (Phase 3,
// Flashcards Competitive Parity Push). Drills the learner's worst cards
// across ALL their sets. Server shell → the client study island.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { WeakAreaDrillSurface } from "@/features/flashcards/components/study/WeakAreaDrillSurface";

export const metadata: Metadata = toolMetadata("flashcards");

export default function FlashcardWeakAreasPage() {
  return <WeakAreaDrillSurface />;
}
