// /education/planner — the AI Study Planner (P5). Server shell → the
// PlannerWorkspace client island: an AI day-by-day plan (generate + calendar
// agenda + adaptive re-plan) plus the goals list that seeds it.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { PlannerWorkspace } from "@/features/education/study/planner/components/PlannerWorkspace";

export const metadata: Metadata = toolMetadata("planner");

export default function PlannerToolPage() {
  return <PlannerWorkspace backHref="/education" />;
}
