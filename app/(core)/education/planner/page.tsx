// /education/planner — real study_goal CRUD (Phase 6 of the flashcards
// competitive parity push). Server shell → the mode-agnostic StudyPlanner
// client island.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { StudyPlanner } from "@/features/education/study/components/StudyPlanner";

export const metadata: Metadata = toolMetadata("planner");

export default function PlannerToolPage() {
  return <StudyPlanner backHref="/education" />;
}
